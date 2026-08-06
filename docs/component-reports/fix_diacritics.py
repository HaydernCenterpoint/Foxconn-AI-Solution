# -*- coding: utf-8 -*-
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def run(args):
    r = subprocess.run(
        args,
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if r.returncode != 0:
        raise SystemExit(f"FAIL {args}\n{r.stderr or r.stdout}")
    return r.stdout


replacements = {
    "docs/component-reports/Frontend-Report.vi.docx": [
        ("Muc luc", "Mục lục"),
        ("Bao cao ky thuat chi tiet", "Báo cáo kỹ thuật chi tiết"),
        ("1. Tom tat dieu hanh", "1. Tóm tắt điều hành"),
        ("2. Vai tro trong kien truc FII", "2. Vai trò trong kiến trúc FII"),
        ("2.1 Ranh gioi trach nhiem", "2.1 Ranh giới trách nhiệm"),
        ("3. Kien truc thu muc va module", "3. Kiến trúc thư mục và module"),
        ("3.1 Cau truc src/", "3.1 Cấu trúc src/"),
        ("4. Luong nguoi dung va routing", "4. Luồng người dùng và routing"),
        ("4.2 Viewer shell (GUEST va mac dinh viewer)", "4.2 Viewer shell (GUEST và mặc định viewer)"),
        ("5. Chuc nang nghiep vu chi tiet", "5. Chức năng nghiệp vụ chi tiết"),
        ("6. Stack cong nghe", "6. Stack công nghệ"),
        ("7. Phan quyen (client map)", "7. Phân quyền (client map)"),
        ("8. Data layer va session", "8. Data layer và session"),
        ("9. Theming va UX", "9. Theming và UX"),
        ("10. Chay, build, kiem thu", "10. Chạy, build, kiểm thử"),
        ("10.1 Demo UI khong backend", "10.1 Demo UI không backend"),
        ("10.2 Dev voi backend", "10.2 Dev với backend"),
        ("11. Rui ro, gioi han va khuyen nghi", "11. Rủi ro, giới hạn và khuyến nghị"),
        ("12. Ket luan", "12. Kết luận"),
        ("Phu luc A. Route map tom tat", "Phụ lục A. Route map tóm tắt"),
        ("Phu luc B. Nguon tham chieu", "Phụ lục B. Nguồn tham chiếu"),
        ("Bao cao ky thuat", "Báo cáo kỹ thuật"),
    ],
    "docs/component-reports/Backend-Report.vi.docx": [
        ("Muc luc", "Mục lục"),
        ("Bao cao ky thuat chi tiet", "Báo cáo kỹ thuật chi tiết"),
        ("1. Tom tat dieu hanh", "1. Tóm tắt điều hành"),
        ("2. Vai tro trong kien truc", "2. Vai trò trong kiến trúc"),
        ("3. Thanh phan runtime", "3. Thành phần runtime"),
        ("3.2 Services va background jobs", "3.2 Services và background jobs"),
        ("4. Luong telemetry end-to-end", "4. Luồng telemetry end-to-end"),
        ("5. Mo hinh du lieu va migration", "5. Mô hình dữ liệu và migration"),
        ("9. Cau hinh quan trong", "9. Cấu hình quan trọng"),
        ("10. Stack phu thuoc", "10. Stack phụ thuộc"),
        ("11. API map dinh huong", "11. API map định hướng"),
        ("12. Chay va kiem thu", "12. Chạy và kiểm thử"),
        ("13. Van hanh va troubleshooting", "13. Vận hành và troubleshooting"),
        ("14. Rui ro va khuyen nghi", "14. Rủi ro và khuyến nghị"),
        ("15. Ket luan", "15. Kết luận"),
        ("Phu luc - Nguon", "Phụ lục — Nguồn"),
        ("Bao cao ky thuat", "Báo cáo kỹ thuật"),
    ],
    "docs/component-reports/Odysseus-Report.vi.docx": [
        ("Muc luc", "Mục lục"),
        ("Bao cao ky thuat chi tiet (optional plane)", "Báo cáo kỹ thuật chi tiết (optional plane)"),
        ("1. Tom tat dieu hanh", "1. Tóm tắt điều hành"),
        ("2. Ranh gioi voi FII", "2. Ranh giới với FII"),
        ("3. Kien truc noi bo Odysseus", "3. Kiến trúc nội bộ Odysseus"),
        ("3.1 Lop ung dung", "3.1 Lớp ứng dụng"),
        ("3.2 Agent va tools", "3.2 Agent và tools"),
        ("3.3 RAG va embeddings", "3.3 RAG và embeddings"),
        ("4. Tinh nang san pham (upstream + FII)", "4. Tính năng sản phẩm (upstream + FII)"),
        ("5. FII REST bridge va MCP", "5. FII REST bridge và MCP"),
        (
            "5.1 Endpoints bridge (admin session hoac internal trusted tool path)",
            "5.1 Endpoints bridge (admin session hoặc internal trusted tool path)",
        ),
        ("6. Profile fii-chat (khuyen nghi monorepo)", "6. Profile fii-chat (khuyến nghị monorepo)"),
        ("7. Chay local", "7. Chạy local"),
        ("8. Bao mat", "8. Bảo mật"),
        ("9. Kiem thu", "9. Kiểm thử"),
        (
            "10. Rui ro, gioi han, roadmap su dung trong FII",
            "10. Rủi ro, giới hạn, roadmap sử dụng trong FII",
        ),
        ("11. Ket luan", "11. Kết luận"),
        ("Phu luc - Nguon", "Phụ lục — Nguồn"),
        ("Bao cao ky thuat", "Báo cáo kỹ thuật"),
    ],
    "docs/component-reports/ODF-Report.vi.docx": [
        ("Muc luc", "Mục lục"),
        ("Bao cao ky thuat chi tiet", "Báo cáo kỹ thuật chi tiết"),
        ("1. Tom tat dieu hanh", "1. Tóm tắt điều hành"),
        ("2. Vai tro trong he sinh thai FII", "2. Vai trò trong hệ sinh thái FII"),
        ("3. Nguyen tac thiet ke", "3. Nguyên tắc thiết kế"),
        ("4. Kien truc san pham", "4. Kiến trúc sản phẩm"),
        ("5. Nang luc san pham (capability map)", "5. Năng lực sản phẩm (capability map)"),
        ("7. Tich hop FII (outbox path)", "7. Tích hợp FII (outbox path)"),
        ("7.3 Preview an toan", "7.3 Preview an toàn"),
        ("8. Bao mat va governance", "8. Bảo mật và governance"),
        ("9. Van hanh, cutover, pilot", "9. Vận hành, cutover, pilot"),
        ("10. Chay standalone product", "10. Chạy standalone product"),
        ("11. Rui ro va khuyen nghi cho FII", "11. Rủi ro và khuyến nghị cho FII"),
        ("12. Ket luan", "12. Kết luận"),
        ("Phu luc - Nguon", "Phụ lục — Nguồn"),
        ("Bao cao ky thuat", "Báo cáo kỹ thuật"),
    ],
}


def main():
    for file, pairs in replacements.items():
        run(["officecli", "open", file])
        for old, new in pairs:
            run(["officecli", "set", file, "/", "--find", old, "--replace", new])
        run(["officecli", "save", file])
        try:
            run(["officecli", "close", file])
        except SystemExit:
            pass
        print("Updated:", file)
    print("Done.")


if __name__ == "__main__":
    main()
