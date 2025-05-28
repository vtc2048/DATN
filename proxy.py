import os
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
import requests

app = Flask(__name__, static_folder='static')
CORS(app)

API_URL = 'http://vngalaxy.vn:5000/get_data'
TOKEN = '43497e17-9d24-4b08-97f1-4a08366bb9f1'

@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

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