export function srtToVtt(srtContent: string): string {
    // 1. Change comma to dot in timestamps
    let vtt = srtContent.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

    // 2. Add WEBVTT header if not present
    if (!vtt.startsWith('WEBVTT')) {
        vtt = 'WEBVTT\n\n' + vtt;
    }

    return vtt;
}
