// whoosh native paste addon · Windows implementation
//
// 行为：
//   1. 可选 OpenClipboard + GetClipboardData(CF_UNICODETEXT) 保存当前文本
//   2. EmptyClipboard + SetClipboardData(CF_UNICODETEXT, ...) 写入新文本
//   3. 可选注册并写入 ExcludeClipboardContentFromMonitorProcessing(DWORD=0)
//      + CanIncludeInClipboardHistory(DWORD=0) 让 Win10+ Clipboard History 跳过
//   4. SendInput 模拟 Ctrl+V
//   5. detach std::thread Sleep(400) 后恢复原文本（避免阻塞调用线程）
//
// 注：M4 阶段在 macOS 本地无法运行测试，仅保证 Windows CI 编译通过。

#include <windows.h>
#include <napi.h>
#include <string>
#include <thread>
#include <chrono>

static UINT g_excludeFormat = 0;
static UINT g_canIncludeFormat = 0;

static void EnsureFormats() {
    if (g_excludeFormat == 0) {
        g_excludeFormat = RegisterClipboardFormatW(L"ExcludeClipboardContentFromMonitorProcessing");
    }
    if (g_canIncludeFormat == 0) {
        g_canIncludeFormat = RegisterClipboardFormatW(L"CanIncludeInClipboardHistory");
    }
}

static std::wstring Utf8ToWide(const std::string& utf8) {
    if (utf8.empty()) return L"";
    int needed = MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), -1, nullptr, 0);
    if (needed <= 0) return L"";
    std::wstring wide(static_cast<size_t>(needed - 1), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), -1, wide.data(), needed);
    return wide;
}

static bool ReadClipboardText(std::wstring& out) {
    if (!OpenClipboard(nullptr)) return false;
    bool ok = false;
    HANDLE h = GetClipboardData(CF_UNICODETEXT);
    if (h != nullptr) {
        wchar_t* p = static_cast<wchar_t*>(GlobalLock(h));
        if (p != nullptr) {
            out = p;
            GlobalUnlock(h);
            ok = true;
        }
    }
    CloseClipboard();
    return ok;
}

static bool WriteClipboardText(const std::wstring& text, bool markTransient) {
    if (!OpenClipboard(nullptr)) return false;
    EmptyClipboard();

    const size_t bytes = (text.size() + 1) * sizeof(wchar_t);
    HGLOBAL h = GlobalAlloc(GMEM_MOVEABLE, bytes);
    if (h == nullptr) {
        CloseClipboard();
        return false;
    }
    wchar_t* p = static_cast<wchar_t*>(GlobalLock(h));
    memcpy(p, text.c_str(), bytes);
    GlobalUnlock(h);
    SetClipboardData(CF_UNICODETEXT, h);

    if (markTransient) {
        EnsureFormats();

        // 两个 marker 都设 DWORD 形式；具体值不重要，存在即生效（Microsoft 文档化的 sentinel）
        auto setMarker = [](UINT fmt) {
            HGLOBAL hm = GlobalAlloc(GMEM_MOVEABLE, sizeof(DWORD));
            if (hm == nullptr) return;
            DWORD* pm = static_cast<DWORD*>(GlobalLock(hm));
            *pm = 0;
            GlobalUnlock(hm);
            SetClipboardData(fmt, hm);
        };
        if (g_excludeFormat != 0) setMarker(g_excludeFormat);
        if (g_canIncludeFormat != 0) setMarker(g_canIncludeFormat);
    }

    CloseClipboard();
    return true;
}

static void SendCtrlV() {
    INPUT inputs[4] = {};
    inputs[0].type = INPUT_KEYBOARD;
    inputs[0].ki.wVk = VK_CONTROL;

    inputs[1].type = INPUT_KEYBOARD;
    inputs[1].ki.wVk = 'V';

    inputs[2].type = INPUT_KEYBOARD;
    inputs[2].ki.wVk = 'V';
    inputs[2].ki.dwFlags = KEYEVENTF_KEYUP;

    inputs[3].type = INPUT_KEYBOARD;
    inputs[3].ki.wVk = VK_CONTROL;
    inputs[3].ki.dwFlags = KEYEVENTF_KEYUP;

    SendInput(static_cast<UINT>(ARRAYSIZE(inputs)), inputs, sizeof(INPUT));
}

static Napi::Value PasteText(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "pasteText: first argument must be a string").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string utf8 = info[0].As<Napi::String>().Utf8Value();
    std::wstring text = Utf8ToWide(utf8);

    bool preserveClipboard = true;
    bool markTransient = true;
    if (info.Length() >= 2 && info[1].IsObject()) {
        Napi::Object opts = info[1].As<Napi::Object>();
        if (opts.Has("preserveClipboard")) preserveClipboard = opts.Get("preserveClipboard").ToBoolean();
        if (opts.Has("markTransient"))    markTransient    = opts.Get("markTransient").ToBoolean();
    }

    std::wstring original;
    bool hasOriginal = false;
    if (preserveClipboard) {
        hasOriginal = ReadClipboardText(original);
    }

    WriteClipboardText(text, markTransient);
    SendCtrlV();

    if (preserveClipboard && hasOriginal) {
        std::wstring toRestore = original;
        std::thread([toRestore]() {
            std::this_thread::sleep_for(std::chrono::milliseconds(400));
            WriteClipboardText(toRestore, /*markTransient*/ false);
        }).detach();
    }

    return env.Undefined();
}

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("pasteText", Napi::Function::New(env, PasteText));
    return exports;
}

NODE_API_MODULE(paste, Init)
