export interface TransposeResult {
    semitones: number;
    accidentalPref: null | 'sharp' | 'flat';
    targetKey: string;
}