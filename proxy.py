import os
import psycopg2
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import requests
import logging

# Thiết lập logging để ghi lại thông tin và lỗi
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Khởi tạo ứng dụng Flask
app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# Cấu hình API và cơ sở dữ liệu
API_URL = 'https://api.lpwanmapper.com/get_data'
TOKEN = '408ff5ba-2b23-40d4-b76a-64c89e02047e'
DATABASE_URL = os.getenv('DATABASE_URL', 'postgres://neondb_owner:png_Df4vdjnc8yR@p-withered-brook-a89beui-pooler.eastus2.azure.neon.tech/neondb?sslmode=require')

# Kết nối cơ sở dữ liệu Neon
try:
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    logger.info("Kết nối cơ sở dữ liệu thành công")
except psycopg2.Error as e:
    logger.error(f"Lỗi kết nối cơ sở dữ liệu: {str(e)}")
    conn = None

# Route để phục vụ tệp index.html
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

# Route để lấy dữ liệu từ API bên thứ ba và lưu vào cơ sở dữ liệu
@app.route('/api/data', methods=['GET'])
def get_data():
    try:
        if not conn:
            return jsonify({'error': 'Không thể kết nối cơ sở dữ liệu'}), 500

        headers = {'Authorization': f'Bearer {TOKEN}'}
        response = requests.get(API_URL, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        latest = data[-1] if isinstance(data, list) and data else data
        obj = latest.get('object', {}) if isinstance(latest, dict) else {}

        if obj:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO aqi_circles (latitude, longitude, aqi, level, pm25, pm10, no2, so2, co, temperature, humidity, uv)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                obj.get('latitude'),
                obj.get('longitude'),
                0,
                'unknown',
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

        return jsonify(data)
    except requests.RequestException as e:
        logger.error(f"Lỗi gọi API: {str(e)}")
        return jsonify({'error': f'Lỗi gọi API: {str(e)}'}), 500
    except Exception as e:
        logger.error(f"Lỗi không xác định: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Route để lưu dữ liệu AQI vào cơ sở dữ liệu
@app.route('/api/log', methods=['POST'])
def log_data():
    try:
        if not conn:
            return jsonify({'error': 'Không thể kết nối cơ sở dữ liệu'}), 500

        new_data = request.json
        if not new_data:
            return jsonify({'error': 'Không nhận được dữ liệu'}), 400

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

        return jsonify({'message': 'Lưu dữ liệu thành công'}), 200
    except Exception as e:
        logger.error(f"Lỗi khi lưu dữ liệu: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Route để lấy dữ liệu AQI đã lưu từ cơ sở dữ liệu
@app.route('/api/log', methods=['GET'])
def get_logged_data():
    try:
        if not conn:
            return jsonify({'error': 'Không thể kết nối cơ sở dữ liệu'}), 500

        cur = conn.cursor()
        cur.execute("SELECT latitude, longitude, aqi, level FROM aqi_circles WHERE aqi != 0 AND level != 'unknown'")
        rows = cur.fetchall()
        cur.close()

        data = [{"lat": row[0], "lng": row[1], "aqi": row[2], "level": row[3]} for row in rows]
        return jsonify(data), 200
    except Exception as e:
        logger.error(f"Lỗi khi lấy dữ liệu đã lưu: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=int(os.getenv('PORT', 5500)))
