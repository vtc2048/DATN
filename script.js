var map, marker, aqiCircle, visitedLocations = {};

function initMap() {
    if (map) {
        map.remove(); 
    }
    map = L.map('map').setView([16.05, 108.2], 13); 
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

function calculateAQI(conc, breakpoints) {
    for (let i = 0; i < breakpoints.length - 1; i++) {
        const C_low = breakpoints[i].C_low;
        const C_high = breakpoints[i + 1].C_low;
        const I_low = breakpoints[i].I_low;
        const I_high = breakpoints[i + 1].I_low;
        if (conc >= C_low && conc <= C_high) {
            return Math.round(((conc - C_low) / (C_high - C_low)) * (I_high - I_low) + I_low);
        }
    }
    return breakpoints[breakpoints.length - 1].I_low;
}

function calculateVNAQI(pm25, pm10, no2, so2, co) {
    const pm25Breakpoints = [
        { C_low: 0, I_low: 0 }, { C_low: 12.1, I_low: 51 }, { C_low: 35.5, I_low: 101 },
        { C_low: 55.5, I_low: 151 }, { C_low: 150.5, I_low: 201 }, { C_low: 250.5, I_low: 301 }
    ];
    const pm10Breakpoints = [
        { C_low: 0, I_low: 0 }, { C_low: 50.1, I_low: 51 }, { C_low: 150.1, I_low: 101 },
        { C_low: 250.1, I_low: 151 }, { C_low: 350.1, I_low: 201 }, { C_low: 420.1, I_low: 301 }
    ];
    const no2Breakpoints = [
        { C_low: 0, I_low: 0 }, { C_low: 0.054, I_low: 51 }, { C_low: 0.101, I_low: 101 },
        { C_low: 0.361, I_low: 151 }, { C_low: 0.651, I_low: 201 }, { C_low: 1.241, I_low: 301 }
    ];
    const so2Breakpoints = [
        { C_low: 0, I_low: 0 }, { C_low: 0.036, I_low: 51 }, { C_low: 0.076, I_low: 101 },
        { C_low: 0.186, I_low: 151 }, { C_low: 0.305, I_low: 201 }, { C_low: 0.605, I_low: 301 }
    ];
    const coBreakpoints = [
        { C_low: 0, I_low: 0 }, { C_low: 4.5, I_low: 51 }, { C_low: 9.5, I_low: 101 },
        { C_low: 12.5, I_low: 151 }, { C_low: 15.5, I_low: 201 }, { C_low: 30.5, I_low: 301 }
    ];

    const aqiPM25 = calculateAQI(pm25, pm25Breakpoints);
    const aqiPM10 = calculateAQI(pm10, pm10Breakpoints);
    const aqiNO2 = calculateAQI(no2, no2Breakpoints);
    const aqiSO2 = calculateAQI(so2, so2Breakpoints);
    const aqiCO = calculateAQI(co, coBreakpoints);

    return Math.max(aqiPM25, aqiPM10, aqiNO2, aqiSO2, aqiCO);
}

function getAQIColor(aqi) {
    if (aqi <= 50) return '#00e400'; // Tốt
    if (aqi <= 100) return '#ffff00'; // Trung bình
    if (aqi <= 150) return '#ff7e00'; // Kém
    if (aqi <= 200) return '#ff0000'; // Xấu
    if (aqi <= 300) return '#99004c'; // Rất xấu
    return '#7e0023'; // Nguy hại app.run(debug=True, host='0.0.0.0', port=5000)
}

function createAQIIcon(aqi) {
    const color = getAQIColor(aqi);
    return L.divIcon({
        className: 'aqi-marker',
        html: `<div class="aqi-sign" style="background-color: ${color}"><span>AQI: ${aqi}</span></div><div class="aqi-pole"></div>`,
        iconSize: [60, 80],
        iconAnchor: [30, 80]
    });
}

function fetchData() {
    fetch('https://datnw.onrender.com/api/data')
        .then(res => res.json())
        .then(data => {
            //const latest = data[data.length - 1];
            const latest = data[00];
            const obj = latest.object;
            if (!obj) throw new Error("Không tìm thấy object");

            const lat = obj.latitude;
            const lng = obj.longitude;
            const locationKey = `${lat.toFixed(4)},${lng.toFixed(4)}`; // Sử dụng 4 chữ số thập phân để tăng độ chính xác

            const pm25 = obj.pm25;
            const pm10 = obj.pm10;
            const no2 = obj.no2;
            const so2 = obj.so2;
            const co = obj.co;
            const vnAQI = calculateVNAQI(pm25, pm10, no2, so2, co);

            document.getElementById("temperature").textContent = obj.temperature.toFixed(1) + " °C";
            document.getElementById("humidity").textContent = obj.humidity.toFixed(1) + " %";
            document.getElementById("no2").textContent = obj.no2 + " ppm";
            document.getElementById("so2").textContent = obj.so2 + " ppm";
            document.getElementById("pm10").textContent = obj.pm10 + " µg/m³";
            document.getElementById("pm25").textContent = obj.pm25 + " µg/m³";
            document.getElementById("co").textContent = obj.co + " µg/m³";
            document.getElementById("uv").textContent = obj.uv + "";

            const aqiIndicator = document.getElementById("aqiIndicator");
            const aqiWidth = document.querySelector(".aqi-bar").offsetWidth;
            const position = (vnAQI / 500) * aqiWidth;
            aqiIndicator.style.left = `${position}px`;
            aqiIndicator.dataset.level = vnAQI <= 50 ? 'good' : vnAQI <= 100 ? 'moderate' : vnAQI <= 150 ? 'unhealthy-for-sensitive' : vnAQI <= 200 ? 'unhealthy' : vnAQI <= 300 ? 'very-unhealthy' : 'hazardous';

            // Cập nhật marker và vòng tròn
            if (visitedLocations[locationKey]) {
                // Nếu vị trí đã được ghi nhận, cập nhật marker và vòng tròn
                if (marker) {
                    marker.setLatLng([lat, lng]);
                    marker.setIcon(createAQIIcon(vnAQI));
                }
                if (aqiCircle) {
                    aqiCircle.setStyle({ fillColor: getAQIColor(vnAQI), fillOpacity: 0.5 });
                    aqiCircle.setLatLng([lat, lng]);
                }
                visitedLocations[locationKey].aqi = vnAQI;
            } else {
                // Nếu vị trí mới, tạo marker và vòng tròn mới
                if (marker) map.removeLayer(marker);
                if (aqiCircle) map.removeLayer(aqiCircle);

                marker = L.marker([lat, lng], { icon: createAQIIcon(vnAQI) }).addTo(map);
                aqiCircle = L.circle([lat, lng], {
                    color: 'transparent',
                    fillColor: getAQIColor(vnAQI),
                    fillOpacity: 0.5,
                    radius: 500
                }).addTo(map);

                visitedLocations[locationKey] = { aqi: vnAQI, timestamp: Date.now() };
            }

            map.setView([lat, lng], 15);
        })
        .catch(error => {
            console.error("Lỗi khi lấy dữ liệu:", error);
        });
}

function zoomToDistrict(coords) {
    if (map) {
        map.setView(coords, 14); // Zoom level 14 để hiển thị chi tiết quận
    }
}

// Hàm mở tab
function openTab(evt, tabName) {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";  
    }
    tablinks = document.getElementsByClassName("tablink");
    for (i = 0; i < tablinks.length; i++) {
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

document.addEventListener('DOMContentLoaded', function() {
    document.querySelector('.tablink').click();
    setInterval(fetchData, 5000);
});