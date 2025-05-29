# proxy.py
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
import requests
import os
import logging
import time
import psycopg2
from psycopg2 import sql

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app, resources={r"/api/*": {"origins": "*"}})
logging.basicConfig(level=logging.DEBUG)

API_URL = 'http://vngalaxy.vn:5000/get_data'
TOKEN = '43497e17-9d24-4b08-97f1-4a08366bb9f9'

# Kết nối với PostgreSQL
DATABASE_URL = os.getenv('DATABASE_URL')
conn = psycopg2.connect(DATABASE_URL)
cursor = conn.cursor()

# Tạo bảng để lưu dữ liệu cảm biến
cursor.execute("""
    CREATE TABLE IF NOT EXISTS sensor_data (
        id SERIAL PRIMARY KEY,
        latitude FLOAT,
        longitude FLOAT,
        temperature FLOAT,
        humidity FLOAT,
        no2 FLOAT,
        so2 FLOAT,
        pm10 FLOAT,
        pm25 FLOAT,
        co FLOAT,
        uv FLOAT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
""")
conn.commit()

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/api/data', methods=['GET'])
def get_data():
    max_retries = 3
    for attempt in range(max_retries):
        try:
            headers = {
                'Authorization': f'Bearer {TOKEN}'
            }
            app.logger.debug(f"Attempt {attempt + 1}/{max_retries}: Calling API: {API_URL} with token: {TOKEN}")
            response = requests.get(API_URL, headers=headers, timeout=15)
            response.raise_for_status()
            data = response.json()
            app.logger.debug(f"API Response: {data}")
            if not isinstance(data, list) or not data or 'object' not in data[-1]:
                raise ValueError("Dữ liệu không đúng định dạng: cần là mảng với 'object'")

            # Lưu dữ liệu vào PostgreSQL
            obj = data[-1]['object']
            cursor.execute("""
                INSERT INTO sensor_data (latitude, longitude, temperature, humidity, no2, so2, pm10, pm25, co, uv)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                obj['latitude'], obj['longitude'], obj['temperature'], obj['humidity'],
                obj['no2'], obj['so2'], obj['pm10'], obj['pm25'], obj['co'], obj['uv']
            ))
            conn.commit()

            return jsonify(data)
        except requests.exceptions.RequestException as e:
            app.logger.error(f"Attempt {attempt + 1}/{max_retries} failed: Error fetching data from API: {str(e)}")
            if attempt < max_retries - 1:
                time.sleep(2)
            else:
                # Nếu API lỗi, lấy dữ liệu mới nhất từ PostgreSQL
                cursor.execute("SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT 1")
                row = cursor.fetchone()
                if row:
                    default_data = [{
                        "object": {
                            "latitude": row[1],
                            "longitude": row[2],
                            "temperature": row[3],
                            "humidity": row[4],
                            "no2": row[5],
                            "so2": row[6],
                            "pm10": row[7],
                            "pm25": row[8],
                            "co": row[9],
                            "uv": row[10]
                        }
                    }]
                    app.logger.debug("Returning latest data from PostgreSQL")
                    return jsonify(default_data)
                else:
                    # Nếu không có dữ liệu trong DB, trả về dữ liệu mặc định
                    default_data = [
                        {
                            "object": {
                                "latitude": 16.05,
                                "longitude": 108.2,
                                "temperature": 25.0,
                                "humidity": 60.0,
                                "no2": 0.0,
                                "so2": 0.0,
                                "pm10": 0.0,
                                "pm25": 0.0,
                                "co": 0.0,
                                "uv": 0.0
                            }
                        }
                    ]
                    app.logger.debug("No data in PostgreSQL, returning default data")
                    return jsonify(default_data)
        except ValueError as e:
            app.logger.error(f"Data format error: {str(e)}")
            return jsonify({'error': str(e)}), 500
        except Exception as e:
            app.logger.error(f"Unexpected error: {str(e)}")
            return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5500)