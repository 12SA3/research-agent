from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
artifacts = root / "tmp" / "ui-smoke"
artifacts.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    console_errors = []

    desktop = browser.new_page(viewport={"width": 1440, "height": 960})
    desktop.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    desktop.goto("http://127.0.0.1:5174", wait_until="networkidle")
    desktop.get_by_role("heading", name="知识研究工作台").wait_for()
    assert desktop.get_by_role("button", name="导入 PDF / MD / TXT").is_visible()
    assert desktop.get_by_label("研究问题").is_visible()
    desktop.get_by_role("button", name="对比这些 JD 的共同技能要求，并给出准备优先级").click()
    assert "共同技能要求" in desktop.get_by_label("研究问题").input_value()
    desktop.screenshot(path=str(artifacts / "desktop.png"), full_page=True)

    mobile = browser.new_page(viewport={"width": 375, "height": 812})
    mobile.goto("http://127.0.0.1:5174", wait_until="networkidle")
    assert mobile.get_by_role("button", name="打开文档库").is_visible()
    mobile.get_by_role("button", name="打开文档库").click()
    mobile.wait_for_timeout(350)
    assert mobile.get_by_role("button", name="导入 PDF / MD / TXT").is_visible()
    mobile.get_by_role("button", name="关闭文档库").click()
    mobile.wait_for_timeout(350)
    mobile.get_by_role("button", name="打开执行时间线").click()
    mobile.wait_for_timeout(350)
    assert mobile.get_by_role("heading", name="执行时间线").is_visible()
    mobile.screenshot(path=str(artifacts / "mobile.png"), full_page=True)

    browser.close()

print({"desktop": "ok", "mobile": "ok", "console_errors": console_errors})
