{
  "targets": [
    {
      "target_name": "paste",
      "include_dirs": [
        "<!(node -p \"require('node-addon-api').include_dir\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "NODE_ADDON_API_DISABLE_DEPRECATED"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "conditions": [
        ["OS=='mac'", {
          "sources": [ "mac/paste.mm" ],
          "link_settings": {
            "libraries": [
              "-framework Cocoa",
              "-framework ApplicationServices"
            ]
          },
          "xcode_settings": {
            "CLANG_ENABLE_OBJC_ARC": "YES",
            "MACOSX_DEPLOYMENT_TARGET": "11.0",
            "OTHER_CFLAGS": [ "-fobjc-arc" ],
            "OTHER_CPLUSPLUSFLAGS": [ "-std=c++17", "-stdlib=libc++" ]
          }
        }],
        ["OS=='win'", {
          "sources": [ "win/paste.cpp" ],
          "libraries": [ "-luser32" ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalOptions": [ "/std:c++17", "/EHsc" ]
            }
          }
        }]
      ]
    }
  ]
}
