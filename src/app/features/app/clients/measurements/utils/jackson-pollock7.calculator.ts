import { Gender } from 'src/app/core/types/supabase';

/**
 * Jackson-Pollock 7-site body fat estimation.
 *
 * WHY a static class: this is a pure mathematical transformation with no
 * state and no external dependencies. A static-method class makes it trivially
 * unit-testable and tree-shakable without needing Angular's DI.
 */
export interface Skinfolds {
  chest: number;
  axilla: number;
  triceps: number;
  subscapular: number;
  abdomen: number;
  suprailiac: number;
  thigh: number;
}

export class JacksonPollock7Calculator {
  /**
   * Calculates body fat percentage using the Jackson-Pollock 7-site formula
   * and Siri's equation.
   *
   * @param skinfolds  Seven skinfold values in millimeters.
   * @param ageYears   Client age at the date of measurement (not today).
   * @param gender     Client gender — must be 'male' or 'female'.
   * @returns Body fat percentage rounded to 1 decimal place.
   */
  static calculate(
    skinfolds: Skinfolds,
    ageYears: number,
    gender: Gender
  ): number {
    // Defensive assertion: the type system should prevent invalid values, but
    // guard against runtime surprises from future API changes.
    if (gender !== 'male' && gender !== 'female') {
      throw new Error(
        `JacksonPollock7: unsupported gender value "${gender}". ` +
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
      skinfolds.thigh;

    const sumSquared = sum * sum;

    // Step 1 — Body density per Jackson-Pollock gender-specific constants.
    const bodyDensity = gender === 'male'
      ? 1.112 - 0.00043499 * sum + 0.00000055 * sumSquared - 0.00028826 * ageYears
      : 1.097 - 0.00046971 * sum + 0.00000056 * sumSquared - 0.00012828 * ageYears;

    // Step 2 — Siri equation: % fat = (495 / DC) − 450.
    const bodyFatPct = 495 / bodyDensity - 450;

    return Math.round(bodyFatPct * 10) / 10;
  }

  /**
   * Computes the client's age in completed years at a given reference date.
   * Used so that the formula applies age-at-measurement, not age-today.
   */
  static ageAtDate(birthDateStr: string, referenceDateStr: string): number {
    const [by, bm, bd] = birthDateStr.split('-').map(Number);
    const [ry, rm, rd] = referenceDateStr.split('-').map(Number);

    let age = ry - by;
    // Subtract 1 if the birthday hasn't occurred yet in the reference year.
    if (rm < bm || (rm === bm && rd < bd)) {
      age -= 1;
    }
    return age;
  }
}
