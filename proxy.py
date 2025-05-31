from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import requests
import os
import psycopg2

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)  # Cho phép CORS

API_URL = 'http://vngalaxy.vn:5000/get_data'
TOKEN = '43497e17-9d24-4b08-97f1-4a08366bb9f9'
DATABASE_URL = os.getenv('DATABASE_URL', 'postgres://neondb_owner:png_Df4vdjnc8yR@p-withered-brook-a89beui-pooler.eastus2.azure.neon.tech/neondb?sslmode=require')
conn = psycopg2.connect(DATABASE_URL)

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/api/data', methods=['GET'])
def get_data():
    try:
        headers = {
            'Authorization': f'Bearer {TOKEN}'
        }
        response = requests.get(API_URL, headers=headers)
        response.raise_for_status()
        
        # Lấy dữ liệu từ API
        data = response.json()
        latest = data[-1] if isinstance(data, list) and data else data
        obj = latest.get('object', {}) if isinstance(latest, dict) else {}

        # Lưu dữ liệu vào Neon
        if obj:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO aqi_circles (latitude, longitude, aqi, level, pm25, pm10, no2, so2, co, temperature, humidity, uv)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                obj.get('latitude'),
                obj.get('longitude'),
                0,  # aqi sẽ được tính từ client, để 0 mặc định
                'unknown',  # level sẽ được tính từ client, để 'unknown' mặc định
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
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/log', methods=['POST'])
def log_data():
    try:
        new_data = request.json
        if not new_data:
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

        return jsonify({"message": "Logged successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/log', methods=['GET'])
def get_logged_data():
    try:
        cur = conn.cursor()
        cur.execute("SELECT latitude, longitude, aqi, level FROM aqi_circles WHERE aqi != 0 AND level != 'unknown'")
        rows = cur.fetchall()
        cur.close()

        data = [{"lat": row[0], "lng": row[1], "aqi": row[2], "level": row[3]} for row in rows]
        return jsonify(data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=int(os.getenv('PORT', 5500)))
