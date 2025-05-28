import os
from flask import Flask, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

API_URL = 'http://vngalaxy.vn:5000/get_data'
TOKEN = '43497e17-9d24-4b08-97f1-4a08366bb9f9'

@app.route('/api/data', methods=['GET'])
def get_data():
    try:
        headers = {
            'Authorization': f'Bearer {TOKEN}'
        }
        response = requests.get(API_URL, headers=headers)
        response.raise_for_status()
        return jsonify(response.json())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5500))  # Lấy cổng từ biến môi trường, mặc định 5500 nếu không có
    app.run(debug=False, host='0.0.0.0', port=port)  # Tắt debug và dùng cổng động