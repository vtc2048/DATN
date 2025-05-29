# proxy.py
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
import requests
import os
import logging
import time

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app, resources={r"/api/*": {"origins": "*"}})
logging.basicConfig(level=logging.DEBUG)

API_URL = 'http://vngalaxy.vn:5000/get_data'
TOKEN = '43497e17-9d24-4b08-97f1-4a08366bb9f9'

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
            response = requests.get(API_URL, headers=headers, timeout=15)  # Tăng timeout lên 15 giây
            response.raise_for_status()
            data = response.json()
            app.logger.debug(f"API Response: {data}")
            if not isinstance(data, list) or not data or 'object' not in data[-1]:
                raise ValueError("Dữ liệu không đúng định dạng: cần là mảng với 'object'")
            return jsonify(data)
        except requests.exceptions.RequestException as e:
            app.logger.error(f"Attempt {attempt + 1}/{max_retries} failed: Error fetching data from API: {str(e)}")
            if attempt < max_retries - 1:
                time.sleep(2)  # Chờ 2 giây trước khi thử lại
            else:
                # Trả về dữ liệu mặc định nếu tất cả các lần thử thất bại
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
                app.logger.debug("All attempts failed, returning default data")
                return jsonify(default_data)
    except ValueError as e:
        app.logger.error(f"Data format error: {str(e)}")
        return jsonify({'error': str(e)}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5500)