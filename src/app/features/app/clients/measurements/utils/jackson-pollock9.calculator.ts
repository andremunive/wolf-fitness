import { Gender } from 'src/app/core/types/supabase';

/**
 * Jackson-Pollock 9-site body fat estimation.
 *
 * WHY a static class: this is a pure mathematical transformation with no
 * state and no external dependencies. A static-method class makes it trivially
 * unit-testable and tree-shakable without needing Angular's DI.
 *
 * Variant note: applies the Jackson-Pollock 7-site density coefficients to a
 * 9-pliegue sum (adds biceps + calf). The female age coefficient is set to
 * 0.00028826 (same as male) to match the reference implementation, not the
 * canonical 0.00012828 of the original JP-7 paper.
 */
export interface Skinfolds {
  chest: number;
  axilla: number;
  triceps: number;
  subscapular: number;
  abdomen: number;
  suprailiac: number;
  thigh: number;
  biceps: number;
  calf: number;
}

export class JacksonPollock9Calculator {
  /**
   * Calculates body fat percentage using a 9-site Jackson-Pollock variant
   * and Siri's equation.
   *
   * @param skinfolds  Nine skinfold values in millimeters.
   * @param ageYears   Client age at the date of measurement (not today).
   * @param gender     Client gender — must be 'male' or 'female'.
   * @returns Body fat percentage rounded to 1 decimal, clamped to [0, 100].
   */
  static calculate(
    skinfolds: Skinfolds,
    ageYears: number,
    gender: Gender
  ): number {
    if (gender !== 'male' && gender !== 'female') {
      throw new Error(
        `JacksonPollock9: unsupported gender value "${gender}". ` +
        `Expected 'male' or 'female'.`
      );
    }

    const sum =
      skinfolds.chest +
      skinfolds.axilla +
      skinfolds.triceps +
      skinfolds.subscapular +
      skinfolds.abdomen +
      skinfolds.suprailiac +
      skinfolds.thigh +
      skinfolds.biceps +
      skinfolds.calf;

    const sumSquared = sum * sum;

    const bodyDensity = gender === 'male'
      ? 1.112 - 0.00043499 * sum + 0.00000055 * sumSquared - 0.00028826 * ageYears
      : 1.097 - 0.00046971 * sum + 0.00000056 * sumSquared - 0.00028826 * ageYears;

    // Defensive: a non-positive density would invert the Siri formula.
    if (bodyDensity <= 0) return 0;

    const bodyFatPct = 495 / bodyDensity - 450;

    const clamped = Math.max(0, Math.min(100, bodyFatPct));
    return Math.round(clamped * 10) / 10;
  }

  /**
   * Computes the client's age in completed years at a given reference date.
   * Used so that the formula applies age-at-measurement, not age-today.
   */
  static ageAtDate(birthDateStr: string, referenceDateStr: string): number {
    const [by, bm, bd] = birthDateStr.split('-').map(Number);
    const [ry, rm, rd] = referenceDateStr.split('-').map(Number);

    let age = ry - by;
    if (rm < bm || (rm === bm && rd < bd)) {
      age -= 1;
    }
    return age;
  }
}
