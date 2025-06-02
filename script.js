let map, marker;
let aqiCircles = [];

function initMap() {
    if (map) map.remove();
    map = L.map('map').setView([16.05, 108.2], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

function isDuplicate(lat, lng) {
    const thresholdMeters = 10; // Ngưỡng 10 mét
    for (let circle of aqiCircles) {
        if (map.distance(circle.getLatLng(), L.latLng(lat, lng)) < thresholdMeters) {
            return true;
        }
    }
    return false;
}

const VN_AQI_BREAKPOINTS = {
    pm25: [ { Cp_lo: 0, Cp_hi: 30, I_lo: 0, I_hi: 50 }, { Cp_lo: 31, Cp_hi: 60, I_lo: 51, I_hi: 100 }, { Cp_lo: 61, Cp_hi: 90, I_lo: 101, I_hi: 150 }, { Cp_lo: 91, Cp_hi: 120, I_lo: 151, I_hi: 200 }, { Cp_lo: 121, Cp_hi: 250, I_lo: 201, I_hi: 300 }, { Cp_lo: 251, Cp_hi: 500, I_lo: 301, I_hi: 500 } ],
    pm10: [ { Cp_lo: 0, Cp_hi: 50, I_lo: 0, I_hi: 50 }, { Cp_lo: 51, Cp_hi: 100, I_lo: 51, I_hi: 100 }, { Cp_lo: 101, Cp_hi: 250, I_lo: 101, I_hi: 150 }, { Cp_lo: 251, Cp_hi: 350, I_lo: 151, I_hi: 200 }, { Cp_lo: 351, Cp_hi: 430, I_lo: 201, I_hi: 300 }, { Cp_lo: 431, Cp_hi: 600, I_lo: 301, I_hi: 500 } ],
    co:   [ { Cp_lo: 0, Cp_hi: 5, I_lo: 0, I_hi: 50 }, { Cp_lo: 6, Cp_hi: 10, I_lo: 51, I_hi: 100 }, { Cp_lo: 11, Cp_hi: 17, I_lo: 101, I_hi: 150 }, { Cp_lo: 18, Cp_hi: 34, I_lo: 151, I_hi: 200 }, { Cp_lo: 35, Cp_hi: 46, I_lo: 201, I_hi: 300 }, { Cp_lo: 47, Cp_hi: 60, I_lo: 301, I_hi: 500 } ],
    so2:  [ { Cp_lo: 0, Cp_hi: 50, I_lo: 0, I_hi: 50 }, { Cp_lo: 51, Cp_hi: 100, I_lo: 51, I_hi: 100 }, { Cp_lo: 101, Cp_hi: 199, I_lo: 101, I_hi: 150 }, { Cp_lo: 200, Cp_hi: 349, I_lo: 151, I_hi: 200 }, { Cp_lo: 350, Cp_hi: 439, I_lo: 201, I_hi: 300 }, { Cp_lo: 440, Cp_hi: 600, I_lo: 301, I_hi: 500 } ],
    no2:  [ { Cp_lo: 0, Cp_hi: 100, I_lo: 0, I_hi: 50 }, { Cp_lo: 101, Cp_hi: 200, I_lo: 51, I_hi: 100 }, { Cp_lo: 201, Cp_hi: 300, I_lo: 101, I_hi: 150 }, { Cp_lo: 301, Cp_hi: 400, I_lo: 151, I_hi: 200 }, { Cp_lo: 401, Cp_hi: 500, I_lo: 201, I_hi: 300 }, { Cp_lo: 501, Cp_hi: 600, I_lo: 301, I_hi: 500 } ]
};

function calculateIndividualAQI(value, pollutant) {
    const bps = VN_AQI_BREAKPOINTS[pollutant];
    for (const bp of bps) {
        if (value >= bp.Cp_lo && value <= bp.Cp_hi) {
            return Math.round(((bp.I_hi - bp.I_lo) / (bp.Cp_hi - bp.Cp_lo)) * (value - bp.Cp_lo) + bp.I_lo);
        }
    }
    return -1;
}

function calculateAQIFromSensors(obj) {
    const aqiValues = {
        pm25: calculateIndividualAQI(obj.pm25, "pm25"),
        pm10: calculateIndividualAQI(obj.pm10, "pm10"),
        co:   calculateIndividualAQI(obj.co, "co"),
        so2:  calculateIndividualAQI(obj.so2, "so2"),
        no2:  calculateIndividualAQI(obj.no2, "no2"),
    };
    const maxAQI = Math.max(...Object.values(aqiValues));
    return { aqi: maxAQI, level: getAQILevel(maxAQI) };
}

function getAQILevel(aqi) {
    if (aqi <= 50) return "good";
    if (aqi <= 100) return "moderate";
    if (aqi <= 150) return "unhealthy-for-sensitive";
    if (aqi <= 200) return "unhealthy";
    if (aqi <= 300) return "very-unhealthy";
    return "hazardous";
}

function getAQIColor(level) {
    switch (level) {
        case 'good': return '#00e400';
        case 'moderate': return '#ffff00';
        case 'unhealthy-for-sensitive': return '#ff7e00';
        case 'unhealthy': return '#ff0000';
        case 'very-unhealthy': return '#99004c';
        case 'hazardous': return '#7e0023';
        default: return '#000000';
    }
}

function loadSavedAQI() {
    fetch('/api/log')
        .then(res => {
            if (!res.ok) throw new Error('Failed to fetch AQI data');
            return res.json();
        })
        .then(data => {
            if (!Array.isArray(data)) {
                console.warn("AQI data is not an array, skipping rendering");
                return;
            }
            if (data.length === 0) {
                console.log("No AQI data found in database");
                return;
            }

            // Đảo ngược dữ liệu để duyệt từ cũ đến mới
            data = [...data].reverse();

            // Lọc các điểm không trùng lặp, giữ điểm mới nhất tại mỗi vị trí
            const uniqueData = [];
            for (let i = 0; i < data.length; i++) {
                const current = data[i];
                const latlng = L.latLng(current.lat, current.lng);
                let isDuplicate = false;

                // So sánh với các điểm mới hơn (đã được giữ lại)
                for (let j = 0; j < uniqueData.length; j++) {
                    const existing = uniqueData[j];
                    const dist = map.distance(latlng, L.latLng(existing.lat, existing.lng));
                    if (dist < 10) { // Ngưỡng 10 mét
                        isDuplicate = true;
                        break;
                    }
                }

                // Nếu không trùng, thêm vào danh sách unique
                if (!isDuplicate) {
                    uniqueData.unshift(current); // Thêm vào đầu để giữ thứ tự mới nhất trước
                }
            }

            // Vẽ các vòng tròn không trùng lặp
            uniqueData.forEach(item => {
                const color = getAQIColor(item.level);
                const circle = L.circle([item.lat, item.lng], {
                    stroke: false,
                    fillColor: color,
                    fillOpacity: 0.6,
                    radius: 10
                }).addTo(map).bindPopup(`AQI: ${item.aqi} (${item.level})`);
                aqiCircles.push(circle);
            });
        })
        .catch(err => console.error("Lỗi loadSavedAQI:", err));
}

function fetchData() {
    fetch('/api/data')
        .then(res => {
            if (!res.ok) throw new Error('Failed to fetch data');
            return res.json();
        })
        .then(data => {
            const latest = data[data.length - 1];
            const obj = latest.object;
            if (!obj) throw new Error("Không có object");

            const lat = obj.latitude;
            const lng = obj.longitude;
            const aqiData = calculateAQIFromSensors(obj);
            const aqiColor = getAQIColor(aqiData.level);

            if (!marker) {
                map.setView([lat, lng], 15);
                marker = L.marker([lat, lng]).addTo(map).bindPopup("Trạm");
            } else {
                marker.setLatLng([lat, lng]);
            }

            if (!isDuplicate(lat, lng)) {
                const circle = L.circle([lat, lng], {
                    stroke: false,
                    fillColor: aqiColor,
                    fillOpacity: 0.6,
                    radius: 10
                }).addTo(map).bindPopup(`AQI: ${aqiData.aqi} (${aqiData.level})`);
                aqiCircles.push(circle);
            }

            const dataToSave = {
                lat, lng,
                aqi: aqiData.aqi,
                level: aqiData.level
            };

            return fetch('/api/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSave)
            }).then(res => {
                if (!res.ok) throw new Error('Failed to log data');
                return res.json();
            });
        })
        .then(() => {
            // Cập nhật các giá trị cảm biến
            const latest = data[data.length - 1];
            const obj = latest.object;
            document.getElementById("temperature").textContent = obj.temperature.toFixed(1) + " °C";
            document.getElementById("humidity").textContent = obj.humidity.toFixed(1) + " %";
            document.getElementById("no2").textContent = obj.no2 + " µg/m³";
            document.getElementById("so2").textContent = obj.so2 + " µg/m³";
            document.getElementById("pm10").textContent = obj.pm10 + " µg/m³";
            document.getElementById("pm25").textContent = obj.pm25 + " µg/m³";
            document.getElementById("co").textContent = obj.co + " µg/m³";
            document.getElementById("uv").textContent = obj.uv + "";

            const aqiIndicator = document.getElementById("aqiIndicator");
            const barWidth = document.querySelector(".aqi-bar").offsetWidth;
            const position = (aqiData.aqi / 500) * barWidth;
            aqiIndicator.style.left = `${position}px`;
            aqiIndicator.dataset.level = aqiData.level;
        })
        .catch(err => console.error("Lỗi lấy dữ liệu:", err));
}

function openTab(evt, tabName) {
    const tabcontent = document.getElementsByClassName("tabcontent");
    for (let i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }

    const tablinks = document.getElementsByClassName("tablink");
    for (let i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }

    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.className += " active";

    if (tabName === 'Home') {
        if (!map) initMap();
        else map.invalidateSize();
        fetchData();
    }
}

document.addEventListener('DOMContentLoaded', function () {
    document.querySelector('.tablink').click();
    initMap();
    loadSavedAQI();
    setInterval(fetchData, 5000);
});
