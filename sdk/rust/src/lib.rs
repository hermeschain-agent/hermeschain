use reqwest::blocking::Client as Http;
use serde::Deserialize;

pub struct HermesClient { base: String, http: Http }

#[derive(Deserialize, Debug)]
pub struct ChainStatus {
    pub status: String,
    #[serde(rename = "chainLength")] pub chain_length: u64,
    #[serde(rename = "pendingTransactions")] pub pending_transactions: u64,
}

impl HermesClient {
    pub fn new(base: impl Into<String>) -> Self {
        Self { base: base.into().trim_end_matches("/").to_string(), http: Http::new() }
    }
    pub fn status(&self) -> Result<ChainStatus, reqwest::Error> {
        self.http.get(format!("{}/api/status", self.base)).send()?.json()
    }
}
