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