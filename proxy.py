from flask import Flask, jsonify
import os

app = Flask(__name__)

@app.route('/api/data')
def test_data():
    return jsonify({
        "object": {
            "temperature": 30.5,
            "humidity": 70,
            "latitude": 16.05,
            "longitude": 108.2,
            "pm25": 40,
            "pm10": 50,
            "no2": 0.02,
            "so2": 0.01,
            "co": 0.05,
            "uv": 5.5
        }
    })

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=False, host='0.0.0.0', port=port)
