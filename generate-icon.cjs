const { execFileSync } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname);
const sourcePath = path.join(projectRoot, 'assets', 'icon.png');
const fallbackPath = path.join(projectRoot, 'assets', 'images', 'icon.png');
const outputPath = path.join(projectRoot, 'assets', 'icon.ico');
const powershellScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$sourcePath = [Environment]::GetEnvironmentVariable('ICON_SOURCE')
$outputPath = [Environment]::GetEnvironmentVariable('ICON_OUTPUT')
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$source = [System.Drawing.Image]::FromFile($sourcePath)
$frames = @()

try {
    foreach ($size in $sizes) {
        $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.DrawImage($source, 0, 0, $size, $size)
        $graphics.Dispose()

        $stream = New-Object System.IO.MemoryStream
        $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        $bitmap.Dispose()
        $frames += ,$stream.ToArray()
        $stream.Dispose()
    }
}
finally {
    $source.Dispose()
}

$headerSize = 6 + (16 * $frames.Count)
$dataSize = ($frames | ForEach-Object { $_.Length } | Measure-Object -Sum).Sum
$ico = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($ico)
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]$frames.Count)
$offset = $headerSize

for ($index = 0; $index -lt $frames.Count; $index++) {
    $size = $sizes[$index]
    $frame = $frames[$index]
    $writer.Write([Byte]($(if ($size -eq 256) { 0 } else { $size })))
    $writer.Write([Byte]$(if ($size -eq 256) { 0 } else { $size }))
    $writer.Write([Byte]0)
    $writer.Write([Byte]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]32)
    $writer.Write([UInt32]$frame.Length)
    $writer.Write([UInt32]$offset)
    $offset += $frame.Length
}

foreach ($frame in $frames) {
    $writer.Write($frame)
}

$writer.Flush()
[System.IO.File]::WriteAllBytes($outputPath, $ico.ToArray())
$writer.Dispose()
$ico.Dispose()
Write-Host "Generated $outputPath from $sourcePath"
`;

const selectedSource = require('node:fs').existsSync(sourcePath) ? sourcePath : fallbackPath;
if (!require('node:fs').existsSync(selectedSource)) {
    throw new Error(`Icon source not found: ${sourcePath}`);
}

const encodedScript = Buffer.from(powershellScript, 'utf16le').toString('base64');
execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedScript], {
    cwd: projectRoot,
    env: { ...process.env, ICON_SOURCE: selectedSource, ICON_OUTPUT: outputPath },
    stdio: 'inherit',
});