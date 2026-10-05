
$content = Get-Content index.html -Raw -Encoding UTF8
$content = $content -replace '<h4 style=.text-align: center; color: #113243; font-size: 1\.8rem; font-weight: 700; margin: 2rem auto 2rem auto; max-width: 700px; line-height: 1\.3;.>\s*Las cuatro secciones del tramo Chichinales - Cipolletti\s*</h4>\s*<!-- Lista de secciones -->\s*<div.*?class=.mobile-padding.>\s*<ul.*?>', '<div class=''ruta-audit-section''><h4 class=''audit-title''>Las cuatro secciones del tramo Chichinales – Cipolletti</h4><ul class=''audit-list''>'
Set-Content -Path index.html -Value $content -NoNewline -Encoding UTF8

