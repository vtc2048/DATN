let map, marker;
let aqiCircles = [];

function initMap() {
    if (map) map.remove();
    map = L.map('map').setView([16.05, 108.2], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

const VN_AQI_BREAKPOINTS = {
    pm25: [ { Cp_lo: 0, Cp_hi: 30, I_lo: 0, I_hi: 50 }, { Cp_lo: 31, Cp_hi: 60, I_lo: 51, I_hi: 100 }, { Cp_lo: 61, Cp_hi: 90, I_lo: 101, I_hi: 150 }, { Cp_lo: 91, Cp_hi: 120, I_lo: 151, I_hi: 200 }, { Cp_lo: 121, Cp_hi: 250, I_lo: 201, I_hi: 300 }, { Cp_lo: 251, Cp_hi: 500, I_lo: 301, I_hi: 500 } ],
    pm10: [ { Cp_lo: 0, Cp_hi: 50, I_lo: 0, I_hi: 50 }, { Cp_lo: 51, Cp_hi: 100, I_lo: 51, I_hi: 100 }, { Cp_lo: 101, Cp_hi: 250, I_lo: 101, I_hi: 150 }, { Cp_lo: 251, Cp_hi: 350, I_lo: 151, I_hi: 200 }, { Cp_lo: 351, Cp_hi: 430, I_lo: 201, I_hi: 300 }, { Cp_lo: 431, Cp_hi: 600, I_lo: 301, I_hi: 500 } ],
    co: [ { Cp_lo: 0, Cp_hi: 5, I_lo: 0, I_hi: 50 }, { Cp_lo: 6, Cp_hi: 10, I_lo: 51, I_hi: 100 }, { Cp_lo: 11, Cp_hi: 17, I_lo: 101, I_hi: 150 }, { Cp_lo: 18, Cp_hi: 34, I_lo: 151, I_hi: 200 }, { Cp_lo: 35, Cp_hi: 46, I_lo: 201, I_hi: 300 }, { Cp_lo: 47, Cp_hi: 60, I_lo: 301, I_hi: 500 } ],
    so2: [ { Cp_lo: 0, Cp_hi: 50, I_lo: 0, I_hi: 50 }, { Cp_lo: 51, Cp_hi: 100, I_lo: 51, I_hi: 100 }, { Cp_lo: 101, Cp_hi: 199, I_lo: 101, I_hi: 150 }, { Cp_lo: 200, Cp_hi: 349, I_lo: 151, I_hi: 200 }, { Cp_lo: 350, Cp_hi: 439, I_lo: 201, I_hi: 300 }, { Cp_lo: 440, Cp_hi: 600, I_lo: 301, I_hi: 500 } ],
    no2: [ { Cp_lo: 0, Cp_hi: 100, I_lo: 0, I_hi: 50 }, { Cp_lo: 101, Cp_hi: 200, I_lo: 51, I_hi: 100 }, { Cp_lo: 201, Cp_hi: 300, I_lo: 101, I_hi: 150 }, { Cp_lo: 301, Cp_hi: 400, I_lo: 151, I_hi: 200 }, { Cp_lo: 401, Cp_hi: 500, I_lo: 201, I_hi: 300 }, { Cp_lo: 501, Cp_hi: 600, I_lo: 301, I_hi: 500 } ]
};

function calculateIndividualAQI(value, pollutant) {
    const breakpoints = VN_AQI_BREAKPOINTS[pollutant];
    for (const bp of breakpoints) {
        if (value >= bp.Cp_lo && value <= bp.Cp_hi) {
            return Math.round(((bp.I_hi - bp.I_lo) / (bp.Cp_hi - bp.Cp_lo)) * (value - bp.Cp_lo) + bp.I_lo);
        }
    }
    return -1;
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

function calculateAQIFromSensors(obj) {
    const aqiValues = {
        pm25: calculateIndividualAQI(obj.pm25, "pm25"),
        pm10: calculateIndividualAQI(obj.pm10, "pm10"),
        co: calculateIndividualAQI(obj.co, "co"),
        so2: calculateIndividualAQI(obj.so2, "so2"),
        no2: calculateIndividualAQI(obj.no2, "no2"),
    };
    const maxAQI = Math.max(...Object.values(aqiValues));
    return { aqi: maxAQI, level: getAQILevel(maxAQI) };
}

function fetchData() {
    fetch('https://hethongquantrac.onrender.com/api/data')  // Đã sửa URL, bỏ dấu //
        .then(res => res.json())
        .then(data => {
            const latest = data[data.length - 1];
            const obj = latest.object;
            if (!obj) throw new Error("Không tìm thấy object");

            const lat = obj.latitude;
            const lng = obj.longitude;

            const aqiData = calculateAQIFromSensors(obj);
            const aqiColor = getAQIColor(aqiData.level);

            if (!marker) {
                map.setView([lat, lng], 15); // Chỉ lần đầu
                marker = L.marker([lat, lng]).addTo(map).bindPopup("Trạm quan trắc");
            } else {
                marker.setLatLng([lat, lng]);
            }

            // Xoá vòng tròn cũ nếu trùng vị trí
            const thresholdMeters = 5;
            for (let i = 0; i < aqiCircles.length; i++) {
                const circle = aqiCircles[i];
                const distance = map.distance(circle.getLatLng(), L.latLng(lat, lng));
                if (distance < thresholdMeters) {
                    map.removeLayer(circle);
                    aqiCircles.splice(i, 1);
                    break;
                }
            }

            // Vẽ vòng tròn mới
            const circle = L.circle([lat, lng], {
                stroke: false,
                fillColor: aqiColor,
                fillOpacity: 0.6,
                radius: 10
            }).addTo(map).bindPopup(`AQI: ${aqiData.aqi} (${aqiData.level})`);
            aqiCircles.push(circle);

            // Gửi về server để lưu
            fetch('https://hethongquantrac.onrender.com/api/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lat, lng,
                    aqi: aqiData.aqi,
                    level: aqiData.level
                })
            });

            // Hiển thị dữ liệu cảm biến
            document.getElementById("temperature").textContent = obj.temperature.toFixed(1) + " °C";
            document.getElementById("humidity").textContent = obj.humidity.toFixed(1) + " %";
            document.getElementById("no2").textContent = obj.no2 + " µg/m³";
            document.getElementById("so2").textContent = obj.so2 + " µg/m³";
            document.getElementById("pm10").textContent = obj.pm10 + " µg/m³";
            document.getElementById("pm25").textContent = obj.pm25 + " µg/m³";
            document.getElementById("co").textContent = obj.co + " µg/m³";
            document.getElementById("uv").textContent = obj.uv + "";

            // Thanh chỉ báo AQI
            const aqiIndicator = document.getElementById("aqiIndicator");
            const aqiWidth = document.querySelector(".aqi-bar").offsetWidth;
            const position = (aqiData.aqi / 500) * aqiWidth;
            aqiIndicator.style.left = `${position}px`;
            aqiIndicator.dataset.level = aqiData.level;
        })
        .catch(error => {
            console.error("Lỗi khi lấy dữ liệu:", error);
        });
}

function loadSavedAQI() {
    fetch('https://hethongquantrac.onrender.com/api/log')
        .then(res => res.json())
        .then(data => {
            data.forEach(item => {
                const latlng = L.latLng(item.lat, item.lng);

                // Xoá vòng tròn cũ nếu trùng vị trí
                for (let i = 0; i < aqiCircles.length; i++) {
                    if (map.distance(aqiCircles[i].getLatLng(), latlng) < 5) {
                        map.removeLayer(aqiCircles[i]);
                        aqiCircles.splice(i, 1);
                        break;
                    }
                }

                // Vẽ vòng tròn mới
                const color = getAQIColor(item.level);
                const circle = L.circle(latlng, {
                    stroke: false,
                    fillColor: color,
                    fillOpacity: 0.6,
                    radius: 10
                }).addTo(map).bindPopup(`AQI: ${item.aqi} (${item.level})`);
                aqiCircles.push(circle);
            });
        });
}

function zoomToDistrict(coords) {
    if (map) map.setView(coords, 14);
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
        if (!map) {
            initMap();
        } else {
            map.invalidateSize();
        }
        fetchData();
    }
}

document.addEventListener('DOMContentLoaded', function () {
    document.querySelector('.tablink').click();
    setInterval(fetchData, 5000);
    loadSavedAQI();
});
