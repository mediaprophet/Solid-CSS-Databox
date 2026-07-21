use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallProfile {
    pub type_name: String,
    pub install_dir: String,
    pub config_preset: String,
    pub service_name: String,
    pub required_port: u16,
    pub required_node_version: String,
    pub required_binaries: Vec<String>,
    pub native_edge_binary: Option<String>,
    pub native_edge_http_port: u16,
    pub printer_device: Option<String>,
    pub display_device: Option<String>,
    pub cash_drawer_via: String,
}

impl InstallProfile {
    pub fn from_type(type_name: &str, install_dir: &str, config_override: Option<String>) -> Self {
        let (config_preset, service_name, required_binaries, native_edge_binary) = match type_name {
            "cms:ServerInstall" => (
                config_override.unwrap_or("config/cms/cms.json".to_string()),
                "databox-cms".to_string(),
                vec![],
                None,
            ),
            "cms:PosInstall" => (
                config_override.unwrap_or("config/cms/pos.json".to_string()),
                "databox-pos".to_string(),
                vec!["pos-edge".to_string()],
                Some("pos-edge".to_string()),
            ),
            "cms:ConnectorInstall" => (
                config_override.unwrap_or("config/cms/cms.json".to_string()),
                "databox-connector".to_string(),
                vec!["connector-sidecar".to_string()],
                None,
            ),
            "cms:TraySupervisorInstall" => (
                config_override.unwrap_or("config/cms/cms.json".to_string()),
                "databox-tray".to_string(),
                vec!["tray-supervisor".to_string()],
                None,
            ),
            "cms:CombinedInstall" => (
                config_override.unwrap_or("config/cms/pos.json".to_string()),
                "databox-combined".to_string(),
                vec!["pos-edge".to_string(), "tray-supervisor".to_string()],
                Some("pos-edge".to_string()),
            ),
            _ => (
                config_override.unwrap_or("config/cms/cms.json".to_string()),
                "databox-cms".to_string(),
                vec![],
                None,
            ),
        };

        Self {
            type_name: type_name.to_string(),
            install_dir: install_dir.to_string(),
            config_preset,
            service_name,
            required_port: 3000,
            required_node_version: ">=24.0.0 <25.0.0".to_string(),
            required_binaries,
            native_edge_binary,
            native_edge_http_port: 9100,
            printer_device: None,
            display_device: None,
            cash_drawer_via: "printer".to_string(),
        }
    }

    pub fn node_binary_path(&self) -> String {
        format!("{}/runtime/node/bin/node", self.install_dir)
    }

    pub fn app_dir(&self) -> String {
        format!("{}/app", self.install_dir)
    }

    pub fn data_dir(&self) -> String {
        format!("{}/data", self.install_dir)
    }

    pub fn bin_dir(&self) -> String {
        format!("{}/bin", self.install_dir)
    }
}
