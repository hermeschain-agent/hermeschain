# Subresource Integrity (TASK-359)

External script tags require integrity hashes:

```html
<script src="https://cdn.example.com/lib.js"
        integrity="sha384-..."
        crossorigin="anonymous"></script>
```

Generate with `openssl dgst -sha384 -binary file.js | openssl base64 -A`.
