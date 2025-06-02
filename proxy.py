from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import requests
import os
import psycopg2
import logging

# Thiết lập logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)  # Cho phép CORS

API_URL = 'https://api.lpwanmapper.com/get_data'
TOKEN = '408ff5ba-2b23-40d4-b76a-64c89e02047e'
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable not set")

try:
    conn = psycopg2.connect(DATABASE_URL)
    logger.info("Successfully connected to PostgreSQL database")
except psycopg2.Error as e:
    logger.error(f"Failed to connect to database: {str(e)}")
    raise Exception(f"Failed to connect to database: {str(e)}")

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/api/data', methods=['GET'])
def get_data():
    try:
        headers = {
            'Authorization': f'Bearer {TOKEN}'
        }
        logger.info(f"Calling external API: {API_URL}")
        response = requests.get(API_URL, headers=headers, timeout=10)
        response.raise_for_status()
        
        # Lấy dữ liệu từ API
        data = response.json()
        if not data:
            logger.warning("No data returned from API")
            return jsonify({'error': 'No data returned from API'}), 500
        
        latest = data[-1] if isinstance(data, list) and data else data
        if not isinstance(latest, dict):
            logger.error("Invalid data format from API: expected a dictionary")
            return jsonify({'error': 'Invalid data format from API: expected a dictionary'}), 500
        obj = latest.get('object', {})

        # Chỉ lưu dữ liệu nếu obj có ít nhất một giá trị cần thiết
        if obj and any([obj.get('latitude'), obj.get('longitude')]):
            try:
                cur = conn.cursor()
                cur.execute("""
                    INSERT INTO aqi_circles (latitude, longitude, aqi, level, pm25, pm10, no2, so2, co, temperature, humidity, uv)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    obj.get('latitude'),
                    obj.get('longitude'),
                    0,  # aqi sẽ được tính từ client
                    'unknown',  # level sẽ được tính từ client
                    obj.get('pm25'),
                    obj.get('pm10'),
                    obj.get('no2'),
                    obj.get('so2'),
                    obj.get('co'),
                    obj.get('temperature'),
                    obj.get('humidity'),
                    obj.get('uv')
                ))
                conn.commit()
                cur.close()
                logger.info("Data successfully saved to database")
            except psycopg2.Error as e:
                logger.error(f"Database error while saving data: {str(e)}")
                # Không trả về lỗi 500, chỉ ghi log và tiếp tục
                pass

        return jsonify(data)
    except requests.exceptions.RequestException as e:
        logger.error(f"API request failed: {str(e)}")
        return jsonify({'error': f'API request failed: {str(e)}'}), 500
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return jsonify({'error': f'Unexpected error: {str(e)}'}), 500

@app.route('/api/log', methods=['POST'])
def log_data():
    try:
        new_data = request.json
        if not new_data:
            logger.warning("No data received in POST request")
            return jsonify({"error": "No data received"}), 400

        cur = conn.cursor()
        cur.execute("""
            INSERT INTO aqi_circles (latitude, longitude, aqi, level)
            VALUES (%s, %s, %s, %s)
            RETURNING id
        """, (
            new_data.get('lat'),
            new_data.get('lng'),
            new_data.get('aqi'),
            new_data.get('level')
        ))
        conn.commit()
        cur.close()
        logger.info("Data logged successfully")
        return jsonify({"message": "Logged successfully"}), 200
    except psycopg2.Error as e:
        logger.error(f"Database error: {str(e)}")
        return jsonify({'error': f'Database error: {str(e)}'}), 500
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/log', methods=['GET'])
def get_logged_data():
    try:
        cur = conn.cursor()
        cur.execute("SELECT latitude, longitude, aqi, level FROM aqi_circles WHERE aqi != 0 AND level != 'unknown'")
        rows = cur.fetchall()
        cur.close()

        data = [{"lat": row[0], "lng": row[1], "aqi": row[2], "level": row[3]} for row in rows]
        logger.info(f"Retrieved {len(data)} records from database")
        return jsonify(data), 200
    except psycopg2.Error as e:
        logger.error(f"Database error: {str(e)}")
        return jsonify({'error': f'Database error: {str(e)}'}), 500
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=int(os.getenv('PORT', 5500)))
