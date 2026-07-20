# Local CMS Secret Files

Place local Docker Compose secret files here, for example:

```sh
openssl rand -base64 48 > cms_control_token.txt
```

This directory ignores secret contents by default. Do not commit real deployment secrets.
