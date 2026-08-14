from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
artifacts = root / "tmp" / "ui-smoke"
artifacts.mkdir(parents=True, exist_ok=True)


def mock_chat(route):
    route.fulfill(
        status=200,
        headers={"Content-Type": "text/event-stream; charset=utf-8"},
        body=(
            'data: {"choices":[{"delta":{"content":"这是"}}]}\n\n'
            'data: {"choices":[{"delta":{"content":"模拟的流式回复。"}}]}\n\n'
            "data: [DONE]\n\n"
        ),
    )


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    console_errors = []

    desktop = context.new_page()
    desktop.set_viewport_size({"width": 1440, "height": 960})
    desktop.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    desktop.route("**/api/chat", mock_chat)
    desktop.goto("http://127.0.0.1:5174", wait_until="networkidle")
    assert desktop.evaluate("getComputedStyle(document.documentElement).colorScheme") == "light"

    desktop.get_by_role("heading", name="知识研究工作台").wait_for()
    assert desktop.get_by_role("button", name="导入 PDF / MD / TXT").is_visible()
    assert desktop.get_by_label("研究问题").is_visible()
    desktop.get_by_role("button", name="对比这些 JD 的共同技能要求，并给出准备优先级").click()
    assert "共同技能要求" in desktop.get_by_label("研究问题").input_value()
    desktop.screenshot(path=str(artifacts / "desktop-research.png"), full_page=True)

    desktop.get_by_role("tab", name="普通对话").click()
    assert desktop.url.endswith("#chat")
    desktop.get_by_role("heading", name="普通对话").wait_for()
    desktop.locator("#chat-input").fill("你好，请介绍一下自己")
    desktop.get_by_role("button", name="发送消息").click()
    desktop.get_by_text("这是模拟的流式回复。").wait_for()
    desktop.screenshot(path=str(artifacts / "desktop-chat.png"), full_page=True)

    desktop.get_by_role("tab", name="知识研究").click()
    assert desktop.url.endswith("#research")
    assert "共同技能要求" in desktop.get_by_label("研究问题").input_value()
    desktop.get_by_role("tab", name="普通对话").click()
    assert desktop.get_by_text("这是模拟的流式回复。").is_visible()

    mobile = context.new_page()
    mobile.set_viewport_size({"width": 375, "height": 812})
    mobile.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    mobile.route("**/api/chat", mock_chat)
    mobile.goto("http://127.0.0.1:5174", wait_until="networkidle")
    mobile.get_by_role("tab", name="对话").click()
    assert mobile.get_by_text("这是模拟的流式回复。").is_visible()
    assert mobile.get_by_role("button", name="打开对话列表").is_visible()
    mobile.get_by_role("button", name="打开对话列表").click()
    mobile.wait_for_timeout(300)
    assert mobile.get_by_role("heading", name="普通对话").is_visible()
    mobile.locator(".chat-sidebar-close").click()
    mobile.wait_for_timeout(300)
    mobile.screenshot(path=str(artifacts / "mobile-chat.png"), full_page=True)

    mobile.get_by_role("tab", name="研究").click()
    assert mobile.get_by_role("button", name="打开文档库").is_visible()
    mobile.get_by_role("button", name="打开执行时间线").click()
    mobile.wait_for_timeout(300)
    assert mobile.get_by_role("heading", name="研究进度").is_visible()
    mobile.screenshot(path=str(artifacts / "mobile-research.png"), full_page=True)
    assert mobile.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")

    landscape = context.new_page()
    landscape.set_viewport_size({"width": 812, "height": 375})
    landscape.emulate_media(reduced_motion="reduce")
    landscape.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    landscape.route("**/api/chat", mock_chat)
    landscape.goto("http://127.0.0.1:5174/#chat", wait_until="networkidle")
    assert landscape.get_by_role("heading", name="普通对话").is_visible()
    assert landscape.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
    landscape.screenshot(path=str(artifacts / "landscape-chat.png"), full_page=True)

    context.close()
    browser.close()

print({"desktop": "ok", "mobile": "ok", "console_errors": console_errors})
