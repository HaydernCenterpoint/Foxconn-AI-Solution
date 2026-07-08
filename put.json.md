{
    "protocolVersion": 1,
    "messageId": "d7c49d63-5494-4d89-9a2d-4bf8193f34fa",
    "messageType": "telemetry",
    "clientId": "STATION_01",
    "sentAt": "2026-07-01T01:54:10.123Z",
    "payload": {
        "machineId": "STATION_01",
        "machineName": "Máy Trạm Hàn STUD 01",
        "lineId": "LINE_A",
        "sequence": 1,
        "status": "RUNNING",
        "plcConnected": true,
        "production": {
            "qty": 1250, // Số lượng sản phẩm (Tính lũy kế thông minh tại Client theo ca)
            "time": 2.5, // Thời gian chu kỳ (Giây)
            "uph": 450.5, // Năng suất trung bình mỗi giờ
            "oee": 88.5, // OEE %
            "yieldRate": 99.2, // Tỷ lệ đạt chất lượng %
            "passRate": 99.2
        },
        "alarm": {
            "active": false,
            "code": null,
            "message": null
        },
        "errors": [
            // Danh sách lỗi đang kích hoạt (Nếu có)
        ]
    }
}

sửa backend và client plc

áp dụng duy nhất 1 phương pháp giao thức là mqtt

client có thể nhận dữ liêu và gửi dữ liệu lên server
đảm bảo độ chễ không quá 2s với trên 100 máy cùng kết nối.
các dữ liệu trên giao diện ở frontend cần hiển thị ở 1 máy phải có đầy đủ như ở client giao diện khách
trang chủ, phân tích sản lương, thông báo, ...
không cần gửi ip và thông số máy tính nên backend, thông số máy tính là không cần thiết, địa chỉ ip thì máy chủ sẽ tự phát hiện.
dữ liệu gửi nên ở phỉa backend chỉ cần lưu trữ và gửi lên frontend hiển thị không cần phải phân tích lại các số liệu. 
khi backend bị mất kết nối đến server vẫn cần tính toán và lưu trữ, khi kết nối lại sẽ đồng bộ dữ liệu để chánh mất dữ liệu.
