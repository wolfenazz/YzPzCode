fn main() {
    // Use tauri-build WITHOUT its default application manifest. We embed the
    // Common-Controls v6 manifest ourselves below so that it reaches every
    // target (bins, cdylib, and — critically — `cargo test` unit-test binaries).
    // tauri-build's default path only embeds the manifest into `bin` targets,
    // which leaves `cargo test` binaries without it; `tao` then imports
    // `TaskDialogIndirect` from comctl32.dll, which only exists in the v6
    // common-controls assembly, and the test binary dies at load with
    // 0xc0000139 (STATUS_ENTRYPOINT_NOT_FOUND).
    if let Err(error) = tauri_build::try_build(
        tauri_build::Attributes::new()
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest()),
    ) {
        let error = format!("{error:#}");
        println!("{error}");
        std::process::exit(1);
    }

    #[cfg(target_os = "windows")]
    {
        const APP_MANIFEST: &str = r#"<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity
        type="win32"
        name="Microsoft.Windows.Common-Controls"
        version="6.0.0.0"
        processorArchitecture="*"
        publicKeyToken="6595b64144ccf1df"
        language="*"
      />
    </dependentAssembly>
  </dependency>
</assembly>"#;

        let out_dir = std::env::var("OUT_DIR").expect("OUT_DIR is not set");
        let rc_path = std::path::Path::new(&out_dir).join("app-manifest.rc");

        let mut rc = String::from("#pragma code_page(65001)\n1 24\n{\n");
        for line in APP_MANIFEST.lines() {
            let escaped = line.replace('"', "\"\"");
            rc.push_str(&format!("\" {} \"\n", escaped.trim()));
        }
        rc.push_str("}\n");

        std::fs::write(&rc_path, rc).expect("failed to write app manifest rc");
        embed_resource::compile_for_everything(rc_path.to_str().unwrap(), embed_resource::NONE)
            .manifest_required()
            .expect("failed to embed app manifest");
    }
}
