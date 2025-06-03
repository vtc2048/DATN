let map, marker;
let aqiCircles = [];

function initMap() {
    if (map) map.remove();
    map = L.map('map', {
        closePopupOnClick: false, // Không đóng popup khi nhấp ngoài
        autoClose: false // Cho phép nhiều popup cùng tồn tại
    }).setView([16.05, 108.2], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

// ================== AQI LOGIC ===================

const VN_AQI_BREAKPOINTS = {
    pm25: [ { Cp_lo: 0, Cp_hi: 30, I_lo: 0, I_hi: 50 }, { Cp_lo: 31, Cp_hi: 60, I_lo: 51, I_hi: 100 }, { Cp_lo: 61, Cp_hi: 90, I_lo: 101, I_hi: 150 }, { Cp_lo: 91, Cp_hi: 120, I_lo: 151, I_hi: 200 }, { Cp_lo: 121, Cp_hi: 250, I_lo: 201, I_hi: 300 }, { Cp_lo: 251, Cp_hi: 500, I_lo: 301, I_hi: 500 } ],
    pm10: [ { Cp_lo: 0, Cp_hi: 50, I_lo: 0, I_hi: 50 }, { Cp_lo: 51, Cp_hi: 100, I_lo: 51, I_hi: 100 }, { Cp_lo: 101, Cp_hi: 250, I_lo: 101, I_hi: 150 }, { Cp_lo: 251, Cp_hi: 350, I_lo: 151, I_hi: 200 }, { Cp_lo: 351, Cp_hi: 430, I_lo: 201, I_hi: 300 }, { Cp_lo: 431, Cp_hi: 600, I_lo: 301, I_hi: 500 } ],
    co: [ { Cp_lo: 0, Cp_hi: 5, I_lo: 0, I_hi: 50 }, { Cp_lo: 6, Cp_hi: 10, I_lo: 51, I_hi: 100 }, { Cp_lo: 11, Cp_hi: 17, I_lo: 101, I_hi: 150 }, { Cp_lo: 18, Cp_hi: 34, I_lo: 151, I_hi: 200 }, { Cp_lo: 35, Cp_hi: 46, I_lo: 201, I_hi: 300 }, { Cp_lo: 47, Cp_hi: 60, I_lo: 301, I_hi: 500 } ],
    so2: [ { Cp_lo: 0, Cp_hi: 50, I_lo: 0, I_hi: 50 }, { Cp_lo: 51, Cp_hi: 100, I_lo: 51, I_hi: 100 }, { Cp_lo: 101, Cp_hi: 199, I_lo: 101, I_hi: 150 }, { Cp_lo: 200, Cp_hi: 349, I_lo: 151, I_hi: 200 }, { Cp_lo: 350, Cp_hi: 439, I_lo: 201, I_hi: 300 }, { Cp_lo: 440, Cp_hi: 600, I_lo: 301, I_hi: 500 } ],
    no2: [ { Cp_lo: 0, Cp_hi: 100, I_lo: 0, I_hi: 50 }, { Cp_lo: 101, Cp_hi: 200, I_lo: 51, I_hi: 100 }, { Cp_lo: 201, Cp_hi: 300, I_lo: 101, I_hi: 150 }, { Cp_lo: 301, Cp_hi: 400, I_lo: 151, I_hi: 200 }, { Cp_lo: 401, Cp_hi: 500, I_lo: 201, I_hi: 300 }, { Cp_lo: 501, Cp_hi: 600, I_lo: 301, I_hi: 500 } ]
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
        co: calculateIndividualAQI(obj.co, "co"),
        so2: calculateIndividualAQI(obj.so2, "so2"),
        no2: calculateIndividualAQI(obj.no2, "no2"),
    };
    const maxAQI = Math.max(...Object.values(aqiValues).filter(v => v !== -1)); // Lọc giá trị -1 (không hợp lệ)
    return { aqi: maxAQI !== -Infinity ? maxAQI : 0, level: getAQILevel(maxAQI !== -Infinity ? maxAQI : 0) };
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

// ================= FETCH DATA =======================

function fetchData() {
    fetch('/api/data')
        .then(res => res.json())
        .then(data => {
            if (!data || !Array.isArray(data) || data.length === 0) {
                console.error("Không có dữ liệu hoặc dữ liệu không hợp lệ");
                return;
            }

            // Lọc dữ liệu trong 24 giờ gần nhất
            const now = new Date();
            const oneDayAgo = new Date(now -  2 * 60 * 1000);
            const filteredData = data
                .filter(item => {
                    if (!item.time || !item.object) return false;
                    const itemDate = new Date(item.time);
                    return itemDate >= oneDayAgo && itemDate <= now;
                })
                .sort((a, b) => new Date(b.time) - new Date(a.time)); // Sắp xếp theo thời gian giảm dần

            // Lưu trữ vị trí và trạng thái popup của các vòng tròn hiện tại
            const existingCircles = new Map();
            aqiCircles.forEach(circle => {
                const latlng = circle.getLatLng();
                existingCircles.set(`${latlng.lat.toFixed(5)},${latlng.lng.toFixed(5)}`, circle);
            });

            // Tạo bản đồ vị trí để theo dõi và giữ vòng tròn mới nhất
            const locationMap = new Map();
            filteredData.forEach((item, index) => {
                const obj = item.object;
                if (!obj || !obj.latitude || !obj.longitude) {
                    console.warn(`Dữ liệu tại index ${index} thiếu object hoặc tọa độ`);
                    return;
                }

                const lat = obj.latitude;
                const lng = obj.longitude;
                const latlng = L.latLng(lat, lng);
                const aqiData = calculateAQIFromSensors(obj);
                const aqiColor = getAQIColor(aqiData.level);

                // Tạo khóa vị trí dựa trên tọa độ
                const locationKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;

                if (locationMap.has(locationKey)) {
                    const existingItem = locationMap.get(locationKey);
                    const existingTime = new Date(existingItem.time);
                    const currentTime = new Date(item.time);
                    if (currentTime > existingTime) {
                        locationMap.set(locationKey, item);
                    }
                } else {
                    locationMap.set(locationKey, item);
                }
            });

            // Cập nhật hoặc vẽ lại vòng tròn
            locationMap.forEach((item, key) => {
                const obj = item.object;
                const lat = obj.latitude;
                const lng = obj.longitude;
                const latlng = L.latLng(lat, lng);
                const aqiData = calculateAQIFromSensors(obj);
                const aqiColor = getAQIColor(aqiData.level);

                let circle = existingCircles.get(key);
                if (circle) {
                    // Cập nhật màu sắc và popup của vòng tròn hiện có
                    circle.setStyle({ fillColor: aqiColor });
                    circle.getPopup().setContent(`AQI: ${aqiData.aqi} (${aqiData.level})`);
                } else {
                    // Tạo vòng tròn mới
                    circle = L.circle(latlng, {
                        stroke: false,
                        fillColor: aqiColor,
                        fillOpacity: 0.6,
                        radius: 10
                    }).addTo(map);
                    circle.bindPopup(`AQI: ${aqiData.aqi} (${aqiData.level})`);
                    circle.on('click', function (e) {
                        this.openPopup(); // Mở popup của vòng tròn khi nhấp
                    });
                    aqiCircles.push(circle);
                }
            });

            // Xóa các vòng tròn không còn trong dữ liệu mới
            aqiCircles = aqiCircles.filter(circle => locationMap.has(`${circle.getLatLng().lat.toFixed(5)},${circle.getLatLng().lng.toFixed(5)}`));

            // Cập nhật marker và UI cho dữ liệu mới nhất
            if (filteredData.length > 0) {
                const latestItem = filteredData[0]; // Dữ liệu mới nhất
                const obj = latestItem.object;
                const aqiData = calculateAQIFromSensors(obj); // Tính AQI cho dữ liệu mới nhất
                if (!marker) {
                    map.setView([obj.latitude, obj.longitude], 15);
                    marker = L.marker([obj.latitude, obj.longitude]).addTo(map).bindPopup("Trạm quan trắc");
                    marker.openPopup();
                } else {
                    marker.setLatLng([obj.latitude, obj.longitude]);
                    marker.openPopup();
                }

                document.getElementById("temperature").textContent = obj.temperature.toFixed(1) + " °C";
                document.getElementById("humidity").textContent = obj.humidity.toFixed(1) + " %";
                document.getElementById("no2").textContent = obj.no2 + " µg/m³";
                document.getElementById("so2").textContent = obj.so2 + " µg/m³";
                document.getElementById("pm10").textContent = obj.pm10 + " µg/m³";
                document.getElementById("pm25").textContent = obj.pm25 + " µg/m³";
                document.getElementById("co").textContent = obj.co + " µg/m³";
                document.getElementById("uv").textContent = obj.uv + "";
                document.getElementById("aqi").textContent = aqiData.aqi; // Cập nhật AQI

                const aqiIndicator = document.getElementById("aqiIndicator");
                const barWidth = document.querySelector(".aqi-bar").offsetWidth;
                const position = (aqiData.aqi / 500) * barWidth;
                aqiIndicator.style.left = `${position}px`;
                aqiIndicator.dataset.level = aqiData.level;
            }
        })
        .catch(err => console.error("Lỗi lấy dữ liệu:", err));
}

// ================ UI ================

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
});
