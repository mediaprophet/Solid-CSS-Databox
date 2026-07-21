use anyhow::{Context, Result};
use ldap3::{LdapConnAsync, SearchEntry};
use ldap3::Scope;
use crate::solid_client::SolidClient;

pub async fn sync_ldap(url: &str, solid: &SolidClient) -> Result<()> {
    // 1. Connect to LDAP
    let (conn, mut ldap) = LdapConnAsync::new(url)
        .await
        .context("Failed to connect to LDAP server")?;
    
    // Spawn connection task
    ldap3::drive!(conn);

    // 2. Search for users (example filter)
    let (rs, _res) = ldap.search(
        "dc=example,dc=org",
        Scope::Subtree,
        "(objectClass=person)",
        vec!["uid", "cn", "mail"]
    ).await?.success()?;

    // 3. Map each entry to RDF (R2RML concept)
    for entry in rs {
        let entry = SearchEntry::construct(entry);
        
        let uid = entry.attrs.get("uid").and_then(|v| v.first()).map(|s| s.as_str()).unwrap_or("unknown");
        let cn = entry.attrs.get("cn").and_then(|v| v.first()).map(|s| s.as_str()).unwrap_or("Unknown Name");
        let mail = entry.attrs.get("mail").and_then(|v| v.first()).map(|s| s.as_str()).unwrap_or("");
        
        let turtle = format!(
            "@prefix vcard: <http://www.w3.org/2006/vcard/ns#> .\n\
             @prefix foaf: <http://xmlns.com/foaf/0.1/> .\n\
             \n\
             <#it> a foaf:Person ;\n\
             \tfoaf:name \"{}\" ;\n\
             \tvcard:hasEmail <mailto:{}> .\n",
            cn, mail
        );

        let path = format!("/.databox/sync/ldap/{}.ttl", uid);
        
        println!("Syncing {} to {}", uid, path);
        solid.upload_rdf(&path, &turtle).await?;
    }

    ldap.unbind().await?;
    Ok(())
}
