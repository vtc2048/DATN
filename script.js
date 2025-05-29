// script.js

// Khởi tạo bản đồ Leaflet
const map = L.map('map').setView([16.05, 108.2], 13); // Toạ độ mặc định: Đà Nẵng
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Biến lưu trữ dữ liệu cảm biến
let sensorData = null;

// Hàm tính AQI theo chuẩn Việt Nam (QCVN 05:2013/BTNMT)
function calculateVNAQI(pm25, pm10, no2, so2, co) {
    // Hàm nội suy tuyến tính
    function interpolate(value, breakpoints, aqiValues) {
        for (let i = 0; i < breakpoints.length - 1; i++) {
            if (value >= breakpoints[i] && value <= breakpoints[i + 1]) {
                const aqiLow = aqiValues[i];
                const aqiHigh = aqiValues[i + 1];
                const bpLow = breakpoints[i];
                const bpHigh = breakpoints[i + 1];
                return aqiLow + ((value - bpLow) / (bpHigh - bpLow)) * (aqiHigh - aqiLow);
            }
        }
        return value > breakpoints[breakpoints.length - 1] ? aqiValues[aqiValues.length - 1] : 0;
    }

    // Breakpoints và AQI values theo QCVN 05:2013/BTNMT (µg/m³ trừ CO là mg/m³)
    const pm25Breakpoints = [0, 12.1, 35.5, 55.5, 150.5, 250.5];
    const pm25AQI = [0, 50, 100, 150, 200, 300];
    const pm10Breakpoints = [0, 54, 154, 254, 354, 424];
    const pm10AQI = [0, 50, 100, 150, 200, 300];
    const no2Breakpoints = [0, 200, 700, 1200, 2340, 3090];
    const no2AQI = [0, 50, 100, 150, 200, 300];
    const so2Breakpoints = [0, 125, 350, 500, 750, 1250];
    const so2AQI = [0, 50, 100, 150, 200, 300];
    const coBreakpoints = [0, 5, 10, 15, 30, 40]; // Đơn vị mg/m³
    const coAQI = [0, 50, 100, 150, 200, 300];

    // Tính AQI cho từng chất ô nhiễm
    const aqiPM25 = interpolate(pm25, pm25Breakpoints, pm25AQI);
    const aqiPM10 = interpolate(pm10, pm10Breakpoints, pm10AQI);
    const aqiNO2 = interpolate(no2, no2Breakpoints, no2AQI);
    const aqiSO2 = interpolate(so2, so2Breakpoints, so2AQI);
    const aqiCO = interpolate(co, coBreakpoints, coAQI);

    // Lấy giá trị AQI cao nhất
    return Math.max(aqiPM25, aqiPM10, aqiNO2, aqiSO2, aqiCO);
}

// Hàm lấy màu sắc dựa trên AQI
function getAQIColor(aqi) {
    return aqi <= 50 ? '#00E400' : // Tốt
           aqi <= 100 ? '#FFFF00' : // Trung bình
           aqi <= 150 ? '#FF7E00' : // Kém
           aqi <= 200 ? '#FF0000' : // Xấu
           aqi <= 300 ? '#8F3F97' : // Rất xấu
           '#7E0023'; // Nguy hại
}

// Hàm cập nhật giao diện
function updateInterface(obj) {
    if (!obj) {
        console.log("No sensor data to update interface");
        return;
    }

    // Cập nhật các chỉ số
    document.getElementById("temperature").textContent = obj.temperature.toFixed(1) + " °C";
    document.getElementById("humidity").textContent = obj.humidity.toFixed(1) + " %";
    document.getElementById("no2").textContent = obj.no2.toFixed(1) + " ppm";
    document.getElementById("so2").textContent = obj.so2.toFixed(1) + " ppm";
    document.getElementById("pm10").textContent = obj.pm10.toFixed(1) + " µg/m³";
    document.getElementById("pm25").textContent = obj.pm25.toFixed(1) + " µg/m³";
    document.getElementById("co").textContent = obj.co.toFixed(1) + " ppm";
    document.getElementById("uv").textContent = obj.uv.toFixed(1);

    // Tính và cập nhật AQI
    const vnAQI = calculateVNAQI(obj.pm25, obj.pm10, obj.no2, obj.so2, obj.co);
    document.getElementById("aqiIndicator").textContent = vnAQI.toFixed(0);

    // Cập nhật màu sắc và vị trí trên thanh AQI
    const aqiWidth = document.querySelector(".aqi-bar").offsetWidth;
    const position = (vnAQI / 500) * aqiWidth; // Tỷ lệ AQI/500 (max AQI)
    document.getElementById("aqiIndicator").style.left = `${position}px`;
    document.getElementById("aqiIndicator").style.backgroundColor = getAQIColor(vnAQI);
    document.getElementById("aqiIndicator").dataset.level = vnAQI <= 50 ? 'good' :
                                                          vnAQI <= 100 ? 'moderate' :
                                                          vnAQI <= 150 ? 'unhealthy-for-sensitive' :
                                                          vnAQI <= 200 ? 'unhealthy' :
                                                          vnAQI <= 300 ? 'very-unhealthy' : 'hazardous';

    // Cập nhật bản đồ
    map.setView([obj.latitude, obj.longitude], 13);
    if (map.hasLayer(circle)) {
        map.removeLayer(circle);
    }
    const circle = L.circle([obj.latitude, obj.longitude], {
        color: getAQIColor(vnAQI),
        fillColor: getAQIColor(vnAQI),
        fillOpacity: 0.5,
        radius: 500 // Bán kính 500m
    }).addTo(map);
    circle.bindPopup(`AQI: ${vnAQI.toFixed(0)}<br>PM2.5: ${obj.pm25.toFixed(1)} µg/m³`);

    // Lưu dữ liệu vào localStorage
    localStorage.setItem('sensorData', JSON.stringify(obj));
    console.log("Updated interface with data:", obj);
}

// Hàm tải dữ liệu cảm biến
function loadSensorData() {
    const savedData = localStorage.getItem('sensorData');
    if (savedData) {
        const obj = JSON.parse(savedData);
        updateInterface(obj);
        console.log("Loaded data from localStorage:", obj);
    } else {
        // Dữ liệu mặc định nếu không có dữ liệu lưu
        const defaultData = {
            latitude: 16.05,
            longitude: 108.2,
            temperature: 25.0,
            humidity: 60.0,
            no2: 0.0,
            so2: 0.0,
            pm10: 0.0,
            pm25: 0.0,
            co: 0.0,
            uv: 0.0
        };
        updateInterface(defaultData);
        console.log("Loaded default data:", defaultData);
    }
}

// Hàm gọi API để lấy dữ liệu
function fetchData() {
    fetch('/api/data')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data && data.length > 0 && data[0].object) {
                const obj = data[0].object;
                updateInterface(obj);
            } else {
                console.log("Invalid data format from API:", data);
                loadSensorData(); // Sử dụng dữ liệu lưu nếu API trả về không hợp lệ
            }
        })
        .catch(error => {
            console.error("Error fetching data:", error);
            loadSensorData(); // Sử dụng dữ liệu lưu nếu API thất bại
        });
}

// Khởi tạo khi tải trang
document.addEventListener('DOMContentLoaded', () => {
    loadSensorData(); // Tải dữ liệu lưu ngay khi trang mở
    setInterval(fetchData, 60000); // Cập nhật dữ liệu mỗi 60 giây
});