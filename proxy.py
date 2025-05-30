from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
import requests
import os
import psycopg2
from psycopg2 import sql
import logging
import time

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app, resources={r"/api/*": {"origins": "*"}})
logging.basicConfig(level=logging.DEBUG)

API_URL = 'http://vngalaxy.vn:5000/get_data'
TOKEN = '43497e17-9d24-4b08-97f1-4a08366bb9f9'

# Kết nối với PostgreSQL
DATABASE_URL = os.getenv('DATABASE_URL')
try:
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()
    app.logger.debug("Connected to PostgreSQL successfully")
except Exception as e:
    app.logger.error(f"Failed to connect to PostgreSQL: {str(e)}")
    raise e

# Tạo bảng để lưu dữ liệu cảm biến và AQI
cursor.execute("""
    CREATE TABLE IF NOT EXISTS aqi_circles (
        id SERIAL PRIMARY KEY,
        latitude FLOAT NOT NULL,
        longitude FLOAT NOT NULL,
        aqi INTEGER NOT NULL,
        level VARCHAR(50) NOT NULL,
        pm25 FLOAT,
        pm10 FLOAT,
        no2 FLOAT,
        so2 FLOAT,
        co FLOAT,
        temperature FLOAT,
        humidity FLOAT,
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

            # Lấy dữ liệu cảm biến mới nhất
            obj = data[-1]['object']

            # Tính AQI (sử dụng logic tương tự script.js)
            aqi_data = calculate_aqi(obj)
            aqi = aqi_data['aqi']
            level = aqi_data['level']

            # Lưu dữ liệu vào PostgreSQL
            cursor.execute("""
                INSERT INTO aqi_circles (latitude, longitude, aqi, level, pm25, pm10, no2, so2, co, temperature, humidity, uv)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                obj['latitude'], obj['longitude'], aqi, level,
                obj['pm25'], obj['pm10'], obj['no2'], obj['so2'], obj['co'],
                obj['temperature'], obj['humidity'], obj['uv']
            ))
            conn.commit()
            app.logger.debug("Data saved to PostgreSQL")

            return jsonify(data)
        except requests.exceptions.RequestException as e:
            app.logger.error(f"Attempt {attempt + 1}/{max_retries} failed: Error fetching data from API: {str(e)}")
            if attempt < max_retries - 1:
                time.sleep(2)
            else:
                # Nếu API lỗi, lấy dữ liệu mới nhất từ PostgreSQL
                cursor.execute("SELECT * FROM aqi_circles ORDER BY timestamp DESC LIMIT 1")
                row = cursor.fetchone()
                if row:
                    default_data = [{
                        "object": {
                            "latitude": row[1],
                            "longitude": row[2],
                            "aqi": row[3],
                            "level": row[4],
                            "pm25": row[5],
                            "pm10": row[6],
                            "no2": row[7],
                            "so2": row[8],
                            "co": row[9],
                            "temperature": row[10],
                            "humidity": row[11],
                            "uv": row[12]
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
        except Exception as e:
            app.logger.error(f"Unexpected error: {str(e)}")
            return jsonify({'error': str(e)}), 500

@app.route('/api/circles', methods=['GET'])
def get_circles():
    try:
        # Lấy tất cả các vòng tròn từ PostgreSQL, giới hạn 100 bản ghi gần nhất để tối ưu
        cursor.execute("SELECT latitude, longitude, aqi, level, pm25, pm10, no2, so2, co, temperature, humidity, uv FROM aqi_circles ORDER BY timestamp DESC LIMIT 100")
        rows = cursor.fetchall()
        circles = []
        for row in rows:
            circles.append({
                "latitude": row[0],
                "longitude": row[1],
                "aqi": row[2],
                "level": row[3],
                "pm25": row[4],
                "pm10": row[5],
                "no2": row[6],
                "so2": row[7],
                "co": row[8],
                "temperature": row[9],
                "humidity": row[10],
                "uv": row[11]
            })
        app.logger.debug(f"Retrieved {len(circles)} circles from PostgreSQL")
        return jsonify(circles)
    except Exception as e:
        app.logger.error(f"Error fetching circles: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Hàm tính AQI (tương tự script.js)
def calculate_aqi(obj):
    VN_AQI_BREAKPOINTS = {
        "pm25": [
            {"Cp_lo": 0, "Cp_hi": 30, "I_lo": 0, "I_hi": 50},
            {"Cp_lo": 31, "Cp_hi": 60, "I_lo": 51, "I_hi": 100},
            {"Cp_lo": 61, "Cp_hi": 90, "I_lo": 101, "I_hi": 150},
            {"Cp_lo": 91, "Cp_hi": 120, "I_lo": 151, "I_hi": 200},
            {"Cp_lo": 121, "Cp_hi": 250, "I_lo": 201, "I_hi": 300},
            {"Cp_lo": 251, "Cp_hi": 500, "I_lo": 301, "I_hi": 500},
        ],
        "pm10": [
            {"Cp_lo": 0, "Cp_hi": 50, "I_lo": 0, "I_hi": 50},
            {"Cp_lo": 51, "Cp_hi": 100, "I_lo": 51, "I_hi": 100},
            {"Cp_lo": 101, "Cp_hi": 250, "I_lo": 101, "I_hi": 150},
            {"Cp_lo": 251, "Cp_hi": 350, "I_lo": 151, "I_hi": 200},
            {"Cp_lo": 351, "Cp_hi": 430, "I_lo": 201, "I_hi": 300},
            {"Cp_lo": 431, "Cp_hi": 600, "I_lo": 301, "I_hi": 500},
        ],
        "co": [
            {"Cp_lo": 0, "Cp_hi": 5, "I_lo": 0, "I_hi": 50},
            {"Cp_lo": 6, "Cp_hi": 10, "I_lo": 51, "I_hi": 100},
            {"Cp_lo": 11, "Cp_hi": 17, "I_lo": 101, "I_hi": 150},
            {"Cp_lo": 18, "Cp_hi": 34, "I_lo": 151, "I_hi": 200},
            {"Cp_lo": 35, "Cp_hi": 46, "I_lo": 201, "I_hi": 300},
            {"Cp_lo": 47, "Cp_hi": 60, "I_lo": 301, "I_hi": 500},
        ],
        "so2": [
            {"Cp_lo": 0, "Cp_hi": 50, "I_lo": 0, "I_hi": 50},
            {"Cp_lo": 51, "Cp_hi": 100, "I_lo": 51, "I_hi": 100},
            {"Cp_lo": 101, "Cp_hi": 199, "I_lo": 101, "I_hi": 150},
            {"Cp_lo": 200, "Cp_hi": 349, "I_lo": 151, "I_hi": 200},
            {"Cp_lo": 350, "Cp_hi": 439, "I_lo": 201, "I_hi": 300},
            {"Cp_lo": 440, "Cp_hi": 600, "I_lo": 301, "I_hi": 500},
        ],
        "no2": [
            {"Cp_lo": 0, "Cp_hi": 100, "I_lo": 0, "I_hi": 50},
            {"Cp_lo": 101, "Cp_hi": 200, "I_lo": 51, "I_hi": 100},
            {"Cp_lo": 201, "Cp_hi": 300, "I_lo": 101, "I_hi": 150},
            {"Cp_lo": 301, "Cp_hi": 400, "I_lo": 151, "I_hi": 200},
            {"Cp_lo": 401, "Cp_hi": 500, "I_lo": 201, "I_hi": 300},
            {"Cp_lo": 501, "Cp_hi": 600, "I_lo": 301, "I_hi": 500},
        ]
    }

    def calculate_individual_aqi(value, pollutant):
        breakpoints = VN_AQI_BREAKPOINTS[pollutant]
        for bp in breakpoints:
            if bp["Cp_lo"] <= value <= bp["Cp_hi"]:
                Cp_lo, Cp_hi = bp["Cp_lo"], bp["Cp_hi"]
                I_lo, I_hi = bp["I_lo"], bp["I_hi"]
                aqi = ((I_hi - I_lo) / (Cp_hi - Cp_lo)) * (value - Cp_lo) + I_lo
                return round(aqi)
        return -1

    aqi_values = {
        "pm25": calculate_individual_aqi(obj["pm25"], "pm25"),
        "pm10": calculate_individual_aqi(obj["pm10"], "pm10"),
        "co": calculate_individual_aqi(obj["co"], "co"),
        "so2": calculate_individual_aqi(obj["so2"], "so2"),
        "no2": calculate_individual_aqi(obj["no2"], "no2"),
    }
    max_aqi = max(aqi_values.values())

    def get_aqi_level(aqi):
        if aqi <= 50:
            return "good"
        elif aqi <= 100:
            return "moderate"
        elif aqi <= 150:
            return "unhealthy-for-sensitive"
        elif aqi <= 200:
            return "unhealthy"
        elif aqi <= 300:
            return "very-unhealthy"
        else:
            return "hazardous"

    level = get_aqi_level(max_aqi)
    return {"aqi": max_aqi, "level": level}

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5500)
