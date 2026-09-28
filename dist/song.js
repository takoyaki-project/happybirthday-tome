// Replace `notes` with an audio file later; these start and end times remain the source of truth.
const notes = [
  [0, 392, 240], [260, 392, 240], [520, 440, 480], [1040, 392, 480], [1560, 523.25, 480], [2080, 493.88, 960],
  [3360, 392, 240], [3620, 392, 240], [3880, 440, 480], [4400, 392, 480], [4920, 587.33, 480], [5440, 523.25, 960],
  [6720, 392, 240], [6980, 392, 240], [7240, 783.99, 480], [7760, 659.25, 480], [8280, 523.25, 480], [8800, 493.88, 480], [9320, 440, 960],
  [10600, 349.23, 240], [10860, 349.23, 240], [11120, 329.63, 480], [11640, 261.63, 480], [12160, 293.66, 480], [12680, 261.63, 1200]
];
export const songEndMs = (events = notes) => Math.max(...events.map(([start, , duration]) => start + duration));
export const SONG = { durationMs: songEndMs(notes), notes, lyrics: [
  [0, 'Happy birthday\nto you'], [3360, 'Happy birthday\nto you'],
  [6720, 'Happy birthday\nDear {name}'], [10600, 'Happy birthday\nto you']
] };
// micro:bit's built-in Birthday melody is four three-second phrases.
// The app displays these lyrics but never plays its notes.
export const PLUSH_SONG = {
  durationMs: 12000,
  lyrics: [
    [0, '\u30cf\u30c3\u30d4\u30fc\u30d0\u30fc\u30b9\u30c7\u30fc\n\u30c8\u30a5\u30fc\u30e6\u30fc'],
    [3000, '\u30cf\u30c3\u30d4\u30fc\u30d0\u30fc\u30b9\u30c7\u30fc\n\u30c8\u30a5\u30fc\u30e6\u30fc'],
    [6000, '\u30cf\u30c3\u30d4\u30fc\u30d0\u30fc\u30b9\u30c7\u30fc\n\u30c7\u30a3\u30a2\u3001{name}'],
    [9000, '\u30cf\u30c3\u30d4\u30fc\u30d0\u30fc\u30b9\u30c7\u30fc\n\u30c8\u30a5\u30fc\u30e6\u30fc']
  ]
};