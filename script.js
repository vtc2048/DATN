let map, marker;
let aqiCircles = [];
let isFirstLoad = true; // Biến để theo dõi lần tải đầu tiên
let lastValidData = null; // Biến lưu trữ dữ liệu hợp lệ cuối cùng (có tọa độ)

function initMap() {
    if (map) map.remove();
    map = L.map('map', {
        closePopupOnClick: false, // Không đóng popup khi nhấp ngoài
        autoClose: false // Cho phép nhiều popup cùng tồn tại
    }).setView([16.05, 108.2], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Ngăn chặn đóng popup khi nhấp ngoài và điều chỉnh khi zoom
    map.on('popupopen', function (e) {
        e.popup.options.autoClose = false;
        e.popup.options.closeOnClick = false;
        adjustPopupSize(e.popup);
    });

    // Điều chỉnh popup khi zoom thay đổi
    map.on('zoomend', function () {
        aqiCircles.forEach(circle => {
            if (circle.isPopupOpen()) {
                adjustPopupSize(circle.getPopup());
            }
        });
    });
}

// Hàm điều chỉnh kích thước popup dựa trên mức zoom
function adjustPopupSize(popup) {
    const zoom = map.getZoom();
    let fontSize = 10; // Kích thước font mặc định
    let padding = 1; // Padding mặc định

    // Giảm kích thước font và padding khi zoom nhỏ
    if (zoom < 12) {
        fontSize = 7;
        padding = 1;
    } else if (zoom < 14) {
        fontSize = 7;
        padding = 1;
    }

    const content = popup.getContent();
    popup.setContent(`<div style="font-size: ${fontSize}px; padding: ${padding}px;">${content}</div>`);
    popup.update(); // Cập nhật popup để áp dụng thay đổi
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
    if (aqi <= 150) return "poor";
    if (aqi <= 200) return "unhealthy";
    if (aqi <= 300) return "severe";
    return "hazardous";
}

function getAQIColor(level) {
    switch (level) {
        case 'good': return '#00e400';
        case 'moderate': return '#ffff00';
        case 'poor': return '#ff7e00';
        case 'unhealthy': return '#ff0000';
        case 'severe': return '#99004c';
        case 'hazardous': return '#7e0023';
        default: return '#000000';
    }
}

// ================= FETCH DATA =======================

function fetchData() {
    fetch('/api/data')
        .then(res => {
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return res.json();
        })
        .then(data => {
            if (!data || !Array.isArray(data) || data.length === 0) {
                console.error("Không có dữ liệu hoặc dữ liệu không hợp lệ");
                // Sử dụng dữ liệu cũ nếu có
                if (lastValidData) {
                    renderMapFromData(lastValidData);
                }
                return;
            }

            // Lọc dữ liệu trong 24 giờ gần nhất
            const now = new Date();
            const oneDayAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
            const filteredData = data
                .filter(item => {
                    if (!item.time || !item.object) return false;
                    const itemDate = new Date(item.time);
                    return itemDate >= oneDayAgo && itemDate <= now;
                })
                .sort((a, b) => new Date(b.time) - new Date(a.time)); // Sắp xếp theo thời gian giảm dần

            if (filteredData.length === 0) {
                console.warn("Không có dữ liệu trong 24 giờ qua");
                if (lastValidData) {
                    renderMapFromData(lastValidData);
                }
                return;
            }

            const latestItem = filteredData[0]; // Dữ liệu mới nhất
            const obj = latestItem.object;
            if (!obj) {
                console.warn("Dữ liệu thiếu object");
                if (lastValidData) {
                    renderMapFromData(lastValidData);
                }
                return;
            }

            // Kiểm tra tọa độ (xác định lỗi GPS khi cả latitude và longitude đều là 0.0)
            let gpsError = (obj.latitude === 0.0 && obj.longitude === 0.0);
            if (gpsError) {
                console.warn("Dữ liệu GPS lỗi (0.0, 0.0), sử dụng dữ liệu cũ trên bản đồ");

                // Hiển thị thông báo
                let warningDiv = document.getElementById('gps-warning');
                if (!warningDiv) {
                    warningDiv = document.createElement('div');
                    warningDiv.id = 'gps-warning';
                    warningDiv.style.position = 'absolute';
                    warningDiv.style.top = '60px';
                    warningDiv.style.left = '50%';
                    warningDiv.style.transform = 'translateX(-50%)';
                    warningDiv.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
                    warningDiv.style.color = '#fff';
                    warningDiv.style.padding = '10px';
                    warningDiv.style.borderRadius = '5px';
                    warningDiv.style.zIndex = '1000';
                    warningDiv.textContent = 'Lỗi không thể xác định được vị trí trạm quan trắc';
                    document.getElementById('map').parentElement.appendChild(warningDiv);
                }
            } else {
                // Xóa thông báo nếu có tọa độ hợp lệ
                const warningDiv = document.getElementById('gps-warning');
                if (warningDiv) {
                    warningDiv.remove();
                }
            }

            // Nếu có tọa độ hợp lệ, lưu dữ liệu này làm dữ liệu hợp lệ cuối cùng
            if (!gpsError && obj.latitude >= -90 && obj.latitude <= 90 && obj.longitude >= -180 && obj.longitude <= 180) {
                lastValidData = filteredData;
            }

            // Lưu trạng thái popup hiện tại (vị trí nào đang mở popup)
            const openPopups = new Map();
            aqiCircles.forEach(circle => {
                if (circle.isPopupOpen()) {
                    const latlng = circle.getLatLng();
                    openPopups.set(latlng.toString(), true);
                }
            });

            // Sử dụng dữ liệu hợp lệ (mới hoặc cũ) để vẽ bản đồ
            const dataToRender = gpsError && lastValidData ? lastValidData : filteredData;
            renderMapFromData(dataToRender, openPopups);

            // Cập nhật thông số cảm biến và AQI (luôn sử dụng dữ liệu mới nhất)
            const aqiData = calculateAQIFromSensors(obj); // Tính AQI cho dữ liệu mới nhất
            document.getElementById("temperature").textContent = obj.temperature.toFixed(1) + " °C";
            document.getElementById("humidity").textContent = obj.humidity.toFixed(1) + " %";
            document.getElementById("no2").textContent = obj.no2 + " µg/m³";
            document.getElementById("so2").textContent = obj.so2 + " µg/m³";
            document.getElementById("pm10").textContent = obj.pm10 + " µg/m³";
            document.getElementById("pm25").textContent = obj.pm25 + " µg/m³";
            document.getElementById("co").textContent = obj.co + " µg/m³";
            document.getElementById("uv").textContent = obj.uv + "mW/cm2";
            document.getElementById("aqi").textContent = aqiData.aqi; // Cập nhật AQI

            const aqiIndicator = document.getElementById("aqiIndicator");
            const barWidth = document.querySelector(".aqi-bar").offsetWidth;
            const position = (aqiData.aqi / 500) * barWidth;
            aqiIndicator.style.left = `${position}px`;
            aqiIndicator.dataset.level = aqiData.level;
        })
        .catch(err => {
            console.error("Lỗi lấy dữ liệu:", err);
            // Sử dụng dữ liệu cũ nếu có
            if (lastValidData) {
                renderMapFromData(lastValidData);
            }
        });
}

// Hàm vẽ bản đồ từ dữ liệu (có thể là dữ liệu mới hoặc dữ liệu cũ)
function renderMapFromData(data, openPopups = new Map()) {
    // Tạo danh sách các vị trí duy nhất (không trùng lặp)
    const uniqueLocations = [];
    const distanceThreshold = 100; // Ngưỡng khoảng cách (mét) để xác định vị trí trùng

    data.forEach(item => {
        const obj = item.object;
        if (!obj || !obj.latitude || !obj.longitude) {
            return; // Bỏ qua nếu dữ liệu không có tọa độ
        }

        const lat = obj.latitude;
        const lng = obj.longitude;
        const latlng = L.latLng(lat, lng);

        // Kiểm tra xem vị trí này có gần với vị trí đã có không
        let isDuplicate = false;
        for (let i = 0; i < uniqueLocations.length; i++) {
            const existingItem = uniqueLocations[i];
            const existingLatLng = L.latLng(existingItem.object.latitude, existingItem.object.longitude);
            const distance = latlng.distanceTo(existingLatLng);

            if (distance < distanceThreshold) {
                isDuplicate = true;
                // Giữ bản ghi mới nhất
                if (new Date(item.time) > new Date(existingItem.time)) {
                    uniqueLocations[i] = item;
                }
                break;
            }
        }

        if (!isDuplicate) {
            uniqueLocations.push(item);
        }
    });

    // Lưu trữ các vòng tròn hiện tại
    const existingCircles = new Map();
    aqiCircles.forEach(circle => {
        const latlng = circle.getLatLng();
        existingCircles.set(latlng.toString(), circle);
    });

    // Cập nhật hoặc vẽ lại các vòng tròn
    const newCircles = [];
    uniqueLocations.forEach(item => {
        const obj = item.object;
        const lat = obj.latitude;
        const lng = obj.longitude;
        const latlng = L.latLng(lat, lng);
        const aqiData = calculateAQIFromSensors(obj);
        const aqiColor = getAQIColor(aqiData.level);
        const latlngKey = latlng.toString();

        let circle = existingCircles.get(latlngKey);
        if (circle) {
            // Cập nhật vòng tròn hiện có
            circle.setStyle({ fillColor: aqiColor });
            circle.getPopup().setContent(`AQI: ${aqiData.aqi}`);
            newCircles.push(circle);
        } else {
            // Tạo vòng tròn mới
            circle = L.circle(latlng, {
                stroke: false,
                fillColor: aqiColor,
                fillOpacity: 0.6,
                radius: 60
            }).addTo(map);
            circle.bindPopup(`AQI: ${aqiData.aqi}`, { autoClose: false, closeOnClick: false, autoPan: false });
            circle.on('click', function (e) {
                this.openPopup();
            });
            newCircles.push(circle);
        }

        // Mở lại popup nếu trước đó nó đang mở
        if (openPopups.has(latlngKey)) {
            circle.openPopup();
        }
    });

    // Xóa các vòng tròn không còn trong dữ liệu
    aqiCircles.forEach(circle => {
        if (!newCircles.includes(circle)) {
            map.removeLayer(circle);
        }
    });
    aqiCircles = newCircles;

    // Cập nhật marker cho dữ liệu mới nhất (nếu có tọa độ hợp lệ)
    const latestItem = data[0];
    const obj = latestItem.object;
    if (obj.latitude !== 0.0 || obj.longitude !== 0.0) {
        if (!marker) {
            marker = L.marker([obj.latitude, obj.longitude]).addTo(map).bindPopup("Trạm quan trắc", { autoClose: false, closeOnClick: false });
            marker.openPopup();
        } else {
            marker.setLatLng([obj.latitude, obj.longitude]);
            marker.openPopup();
        }

        // Chỉ setView trong lần tải đầu tiên
        if (isFirstLoad) {
            map.setView([obj.latitude, obj.longitude], 15);
            isFirstLoad = false; // Đặt lại để không setView trong các lần sau
        }
    }
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
