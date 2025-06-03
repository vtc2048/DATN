from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import requests

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)  # Cho phép CORS

API_URL = 'http://api.lpwanmapper.com/get_data'
TOKEN = '408ff5ba-2b23-40d4-b76a-64c89e02047e'

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
        return jsonify(response.json())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5500)
