
$content = Get-Content estilo.css -Raw
$content = $content -replace 'margin: 0 auto 2.5rem auto;', 'margin: 20px auto;'
$content = $content -replace 'letter-spacing: -0.02em;', ''
Set-Content -Path estilo.css -Value $content -NoNewline -Encoding UTF8

