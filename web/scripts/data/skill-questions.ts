/**
 * Skill assessment questions, one bank per Taylor's skill. Every question is
 * written from one step of that skill's checklist in Lynn & LeBon, "Skill
 * Checklists for Taylor's Clinical Nursing Skills" (3rd ed.), and its
 * explanation opens with the skill and step it comes from ("Skill 1-5, step
 * 10: …"), so a student who misses it can open the checklist and read the
 * step. seed-scenario-quizzes.ts composes each skill assessment from the
 * banks of the skills it covers.
 */

export interface SkillQuestion {
  content: string;
  options: string[];
  correct_index: number;
  /** Opens with the citation: "Skill X-Y, step N: …". */
  explanation: string;
}

export const SKILL_QUESTIONS: Record<string, SkillQuestion[]> = {
  '1-1': [
    {
      content: 'Where does the nurse place the covered probe of an electronic thermometer to take an oral temperature?',
      options: [
        'On top of the tongue, just behind the front teeth',
        'Between the cheek and the lower gum, lips closed',
        'In the posterior sublingual pocket, lips closed',
        'Under the tip of the tongue, with the mouth left open',
      ],
      correct_index: 2,
      explanation:
        'Skill 1-1, oral step 12: place the probe beneath the tongue in the posterior sublingual pocket and ask the patient to close the lips around it, then hold it until the beep (step 13).',
    },
    {
      content: 'Before inserting a tympanic thermometer in an adult, how does the nurse straighten the ear canal?',
      options: [
        'Pull the pinna up and back',
        'Pull the pinna down and back',
        'Press the tragus forward over the canal',
        'Tilt the head toward the opposite shoulder',
      ],
      correct_index: 0,
      explanation:
        'Skill 1-1, tympanic step 12: insert the probe snugly, angled toward the jaw line, pulling the pinna up and back to straighten the canal in an adult. The reading is immediate, usually within 2 seconds (step 13).',
    },
    {
      content: 'How far is a lubricated rectal thermometer probe inserted in an adult?',
      options: ['About 0.5 inch', 'About 3 inches', 'About 1 inch', 'About 1.5 inches'],
      correct_index: 3,
      explanation:
        'Skill 1-1, rectal steps 13–15: lubricate about 1 inch of the probe and insert it about 1.5 inches in an adult (1 inch in a child), with the patient side-lying and only the buttocks exposed.',
    },
    {
      content: 'Where is the probe placed for an axillary temperature, and how is the arm positioned?',
      options: [
        'In the centre of the axilla, with the arm brought down close to the body',
        'At the front edge of the axilla, with the arm raised over the head',
        'Against the upper arm, with the arm resting on a pillow',
        'In the centre of the axilla, with the arm held away from the body',
      ],
      correct_index: 0,
      explanation:
        'Skill 1-1, axillary step 12: place the end of the probe in the centre of the axilla and have the patient bring the arm down and close to the body, then hold it until the beep (step 13).',
    },
  ],
  '1-4': [
    {
      content:
        'After counting a radial pulse for 30 seconds, the nurse notices the rhythm is irregular. What should the nurse do?',
      options: [
        'Double the 30-second count and record it',
        'Count again for a full minute',
        'Count for 15 seconds and multiply by 4',
        'Record “irregular” without a rate',
      ],
      correct_index: 1,
      explanation:
        'Skill 1-4, step 9: a 30-second count doubled is only acceptable when the pulse is normal. If the rate, rhythm, or amplitude is abnormal in any way, palpate and count for 1 full minute, then note rhythm and amplitude (step 10).',
    },
    {
      content: 'Which fingers does the nurse use to palpate a peripheral pulse?',
      options: [
        'The thumb alone',
        'The first, second, and third fingers',
        'The thumb and index finger together',
        'The flat of the palm',
      ],
      correct_index: 1,
      explanation:
        'Skill 1-4, step 8: place your first, second, and third fingers over the artery and lightly compress it so the pulsations can be felt and counted.',
    },
    {
      content:
        'The nurse counts 44 beats in 30 seconds at a regular radial pulse of normal amplitude. What rate is recorded?',
      options: [
        '44 beats per minute',
        '88 beats per minute',
        '22 beats per minute',
        'None yet — every pulse is counted for 2 full minutes',
      ],
      correct_index: 1,
      explanation:
        'Skill 1-4, step 9: count the pulsations for 30 seconds and multiply by 2 for the rate per minute. Only a pulse abnormal in rate, rhythm, or amplitude is counted for a full minute.',
    },
    {
      content: 'Besides the rate, what does the nurse note when palpating a pulse?',
      options: [
        'Its rhythm and amplitude',
        'The colour of the nail beds',
        'The temperature of the skin over the artery',
        'The capillary refill time',
      ],
      correct_index: 0,
      explanation: 'Skill 1-4, step 10: note the rhythm and amplitude of the pulse.',
    },
  ],
  '1-5': [
    {
      content: 'Where does the nurse place the stethoscope diaphragm to hear the apical pulse?',
      options: [
        'Second intercostal space, right sternal border',
        'Fifth intercostal space, left midclavicular line',
        'Fourth intercostal space, left sternal border',
        'Fifth intercostal space, left anterior axillary line',
      ],
      correct_index: 1,
      explanation:
        'Skill 1-5, step 10: palpate the fifth intercostal space, move to the left midclavicular line, and place the diaphragm over the apex of the heart.',
    },
    {
      content: 'How long is the apical pulse counted?',
      options: [
        '15 seconds, multiplied by 4',
        '30 seconds, multiplied by 2',
        'A full minute',
        'Until 60 beats have been heard',
      ],
      correct_index: 2,
      explanation: 'Skill 1-5, step 12: using a watch with a second hand, count the heartbeat for 1 minute.',
    },
    {
      content: 'How are the heart sounds counted at the apex?',
      options: [
        'Each “lub-dub” counts as one beat',
        'Each “lub” and each “dub” count as one beat each',
        'Only the “dub” is counted',
        'Each “lub-dub” counts as half a beat',
      ],
      correct_index: 0,
      explanation: 'Skill 1-5, step 11: listen for the heart sounds (“lub-dub”); each “lub-dub” counts as one beat.',
    },
    {
      content: 'What does the nurse do with the stethoscope before and after taking an apical pulse?',
      options: [
        'Nothing — it is cleaned once a shift',
        'Cleans the diaphragm (and earpieces if needed) with alcohol before, and the diaphragm again after',
        'Warms it under running water before use',
        'Covers the diaphragm with a glove',
      ],
      correct_index: 1,
      explanation:
        'Skill 1-5, steps 6 and 14: clean the diaphragm with an alcohol swab before use, and the earpieces if necessary; clean the diaphragm with an alcohol swab again when finished.',
    },
  ],
  '1-6': [
    {
      content: 'Why does the nurse count respirations while the fingers are still on the pulse?',
      options: [
        'So the patient does not notice the breathing is being counted and alter it',
        'Because the respiratory rate is calculated from the pulse rate',
        'To keep the patient’s arm still for the blood pressure',
        'To feel the respirations through the radial artery',
      ],
      correct_index: 0,
      explanation:
        'Skill 1-6, step 1: observe respirations while your fingers are still in place after counting the pulse. People change their breathing when they know it is being watched, so the count stays unobtrusive. Count 30 seconds × 2, or a full minute if abnormal (steps 3–4).',
    },
    {
      content: 'The nurse counts 9 regular breaths of normal depth in 30 seconds. What respiratory rate is recorded?',
      options: [
        '9 breaths per minute',
        '18 breaths per minute',
        '36 breaths per minute',
        'None yet — respirations are always counted for 2 minutes',
      ],
      correct_index: 1,
      explanation: 'Skill 1-6, step 3: count respirations for 30 seconds and multiply by 2 for the rate per minute.',
    },
    {
      content: 'The patient’s breathing is laboured and irregular. How long does the nurse count the respirations?',
      options: [
        '15 seconds, multiplied by 4',
        '30 seconds, multiplied by 2',
        'At least 1 full minute',
        'Until the patient notices and the rate changes',
      ],
      correct_index: 2,
      explanation: 'Skill 1-6, step 4: if respirations are abnormal in any way, count them for at least 1 full minute.',
    },
    {
      content: 'Besides the rate, what does the nurse note about the respirations?',
      options: [
        'Their depth and rhythm',
        'The patient’s preferred position',
        'The colour of the sputum',
        'The oxygen saturation',
      ],
      correct_index: 0,
      explanation: 'Skill 1-6, step 5: note the depth and rhythm of the respirations.',
    },
  ],
  '1-7': [
    {
      content: 'How is the patient positioned for a seated blood pressure?',
      options: [
        'Back supported, legs uncrossed, forearm at heart level',
        'Sitting on the edge of the bed with the arm hanging at his side',
        'Standing, with the arm raised above his head',
        'Sitting with legs crossed and the arm resting on his lap',
      ],
      correct_index: 0,
      explanation:
        'Skill 1-7, step 7: support the forearm at heart level with the palm upward. If he is sitting, the chair supports his back and his legs stay uncrossed. Step 4: first confirm he has relaxed for several minutes.',
    },
    {
      content: 'Where does the blood pressure cuff go?',
      options: [
        'Lower edge resting in the elbow crease, over the brachial pulse',
        'Around the forearm, 2 to 3 cm below the elbow crease',
        'Bladder over the brachial artery, lower edge 2.5 to 5 cm above the inner elbow',
        'High on the upper arm, with the upper edge just below the axilla',
      ],
      correct_index: 2,
      explanation:
        'Skill 1-7, step 9: palpate the brachial artery and center the cuff bladder over it, about midway on the arm, with the lower edge 2.5 to 5 cm above the inner aspect of the elbow and the artery marker lined up.',
    },
    {
      content:
        'The nurse palpates the brachial pulse, inflates the cuff, and the pulse disappears at 150 mm Hg. To what level is the cuff pumped for auscultation, and how fast is it released?',
      options: [
        '150 mm Hg, released at 10 mm Hg per second',
        '180 mm Hg, released at 2 to 3 mm Hg per second',
        '200 mm Hg, released as fast as possible',
        '160 mm Hg, released at 1 mm Hg every 5 seconds',
      ],
      correct_index: 1,
      explanation:
        'Skill 1-7, step 19: pump the pressure 30 mm Hg above the point where the palpated pulse disappeared (150 + 30 = 180), then open the valve so the gauge drops 2 to 3 mm Hg per second. Step 15: after the palpated estimate, deflate and wait 1 minute.',
    },
    {
      content: 'The nurse suspects a blood pressure reading is wrong. How is it repeated?',
      options: [
        'Reinflate the cuff straight away while it is still deflating',
        'Move the cuff to the forearm and try again',
        'Wait 30 minutes and use the other arm only',
        'Deflate the cuff completely and wait at least 1 minute before repeating',
      ],
      correct_index: 3,
      explanation:
        'Skill 1-7, steps 21 and 23: never reinflate the cuff mid-release to recheck the systolic. Let the remaining air escape, deflate the cuff completely, and wait at least 1 minute before repeating a suspicious reading.',
    },
  ],
  '14-1': [
    {
      content: 'Which fingers are the first choice for a pulse oximeter sensor?',
      options: [
        'The thumb, which has the strongest pulse',
        'The little finger, to keep the others free',
        'The index, middle, or ring finger',
        'A toe, so the hands stay free',
      ],
      correct_index: 2,
      explanation:
        'Skill 14-1, step 6a: use the patient’s index, middle, or ring finger, after checking the proximal pulse and capillary refill (6b). Use a toe only if lower-extremity circulation is not compromised (6d).',
    },
    {
      content: 'Circulation at the patient’s finger is poor. Which alternative sensor sites are recommended?',
      options: [
        'The earlobe, forehead, or bridge of the nose',
        'The upper arm, over the brachial artery',
        'The wrist, over the radial artery',
        'None; oximetry is abandoned and an ABG ordered',
      ],
      correct_index: 0,
      explanation:
        'Skill 14-1, step 6c: if circulation at the site is inadequate, consider the earlobe, forehead, or bridge of the nose. On the forehead or nose the emitter and receiver don’t need aligning (step 9).',
    },
    {
      content: 'The oximeter uses a spring-tension finger clip. How often is it removed to check the skin?',
      options: ['Every 30 minutes', 'Every 8 hours', 'Only when the alarm sounds', 'Every 2 hours'],
      correct_index: 3,
      explanation:
        'Skill 14-1, step 13: remove the sensor regularly to check for skin irritation or pressure, every 2 hours for a spring-tension sensor or every 4 hours for an adhesive finger or toe sensor.',
    },
  ],
  '14-2': [
    {
      content: 'Which instruction describes correct incentive spirometer use?',
      options: [
        'Seal the lips, then blow out as hard and as long as possible into the mouthpiece',
        'Breathe in and out rapidly through the mouthpiece to exercise the lungs',
        'Inhale sharply so the indicator jumps to the target, then exhale into the device',
        'Exhale normally, seal the lips, inhale slowly and deeply, then hold for a count of three',
      ],
      correct_index: 3,
      explanation:
        'Skill 14-2, steps 8–10: exhale normally, place the lips securely around the mouthpiece, inhale slowly and as deeply as possible without using the nose, then hold the breath and count to three.',
    },
    {
      content:
        'How often should the patient use the incentive spirometer, and what should they do if they feel light-headed?',
      options: [
        'Twice a day; keep going through any dizziness',
        '5 to 10 times every 1 to 2 hours; stop and breathe normally',
        '50 times each morning; lie flat until it passes',
        'Only when short of breath; call the doctor at once',
      ],
      correct_index: 1,
      explanation:
        'Skill 14-2, steps 11–12: if the patient becomes light-headed, stop and take a few normal breaths before resuming. Encourage 5 to 10 breaths every 1 to 2 hours, if possible.',
    },
    {
      content: 'How is a patient positioned for incentive spirometry after abdominal surgery?',
      options: [
        'Upright or semi-Fowler’s, with a pillow over the incision for splinting',
        'Flat on the back, with the arms at the sides',
        'Side-lying, facing away from the incision',
        'Prone, to open the posterior lung bases',
      ],
      correct_index: 0,
      explanation:
        'Skill 14-2, step 6: assist the patient to an upright or semi-Fowler’s position and, after abdominal or chest surgery, place a pillow or folded blanket over the incision for splinting.',
    },
    {
      content: 'When the patient cannot inhale any further through the spirometer, what should they do?',
      options: [
        'Exhale forcefully into the mouthpiece',
        'Hold the breath and count to three',
        'Take three quick breaths in a row',
        'Remove the mouthpiece and cough immediately',
      ],
      correct_index: 1,
      explanation:
        'Skill 14-2, step 10: when the patient cannot inhale any more, they hold the breath and count to three; the nurse checks the gauge to see the level attained.',
    },
  ],
  '14-3': [
    {
      content:
        'The patient’s saturation stays below target and nasal cannula oxygen is started. Which safety step is required?',
      options: [
        'Review oxygen safety precautions and place “No Smoking” signs',
        'Set the flow meter to its maximum, then titrate down',
        'Tape the prongs to her cheeks so they cannot slip',
        'Remove the humidifier so the flow is not reduced',
      ],
      correct_index: 0,
      explanation:
        'Skill 14-3, step 5: explain the procedure, review the safety precautions needed when oxygen is in use, and place “No Smoking” signs in appropriate areas. The flow rate is set to the order (step 6).',
    },
    {
      content: 'How often does the nurse remove and clean the nasal cannula and check the nares?',
      options: [
        'Every hour, alongside the SpO₂ check',
        'Every 3 days, when the tubing is changed',
        'At least every 8 hours, or per agency policy',
        'Only if she reports soreness or nosebleeds',
      ],
      correct_index: 2,
      explanation:
        'Skill 14-3, step 12: with clean gloves, remove and clean the cannula and assess the nares for irritation or bleeding at least every 8 hours, or according to agency recommendations.',
    },
    {
      content: 'How is nasal cannula tubing positioned on the patient?',
      options: [
        'Over and behind each ear, with the adjuster comfortably under the chin, snug but not tight',
        'Across the forehead and taped to the cheeks',
        'Around the neck, tightened so the prongs cannot move',
        'Over the top of the head, pulled tight at the crown',
      ],
      correct_index: 0,
      explanation:
        'Skill 14-3, steps 7–8: place the tubing over and behind each ear with the adjuster comfortably under the chin (or around the back of the head), padding the ears with gauze as needed; it should be snug but not tight against the skin.',
    },
    {
      content: 'How does the nurse encourage the patient to breathe once the cannula is in place?',
      options: [
        'Through the mouth, with the lips parted',
        'Through the nose, with the mouth closed',
        'Rapidly and shallowly, to take in more oxygen',
        'Holding each breath for three seconds',
      ],
      correct_index: 1,
      explanation: 'Skill 14-3, step 9: encourage the patient to breathe through the nose, with the mouth closed.',
    },
  ],
  '15-1': [
    {
      content: 'Where is the tourniquet applied when starting a peripheral IV?',
      options: [
        'Directly over the intended site, to make the vein stand out',
        '3 to 4 inches above the site, with the radial pulse still present',
        '6 to 8 inches above the site, tight enough to stop the radial pulse',
        'Just below the elbow, whatever vein is chosen',
      ],
      correct_index: 1,
      explanation:
        'Skill 15-1, step 19: apply the tourniquet 3 to 4 inches above the venipuncture site to distend the vein, direct its ends away from the entry site, and make sure the radial pulse is still present. It should stop venous flow, not arterial.',
    },
    {
      content: 'How does the nurse prepare the skin with chlorhexidine before inserting the IV catheter?',
      options: [
        'Wipe once in a circle from the center out, then insert while it is still wet',
        'Apply it for 10 seconds, then wipe it off with an alcohol swab',
        'Scrub from the outside in for 30 seconds, then blot it dry with sterile gauze',
        'Scrub back and forth for at least 30 seconds, then let it air-dry completely',
      ],
      correct_index: 3,
      explanation:
        'Skill 15-1, step 22: press the applicator against the skin, use a back-and-forth friction scrub for at least 30 seconds, do not wipe or blot, and allow it to dry completely.',
    },
    {
      content: 'At what angle, and with the bevel which way, is the IV catheter inserted?',
      options: [
        'Bevel up, at 10 to 15 degrees',
        'Bevel down, at 45 degrees',
        'Bevel up, at 90 degrees',
        'Bevel down, at 10 to 15 degrees',
      ],
      correct_index: 0,
      explanation:
        'Skill 15-1, step 24: holding the catheter by the hub, bevel side up, enter the skin at a 10- to 15-degree angle, directly over or beside the vein. When blood returns in the flashback chamber, advance until the hub is at the site (step 25).',
    },
  ],
  '15-3': [
    {
      content:
        'The patient’s IV site is swollen, cool, and pale, and the arm feels tight. What does this indicate, and what is done?',
      options: [
        'Phlebitis: apply a warm compress and keep the infusion running',
        'Normal findings: slow the rate slightly',
        'Infiltration: the IV is removed and restarted at another site',
        'Fluid overload: increase the rate to clear the line',
      ],
      correct_index: 2,
      explanation:
        'Skill 15-3, step 10: swelling, leakage, coolness, or pallor at the site indicate infiltration. The IV must be removed and restarted at another site, following facility policy for treating the infiltration.',
    },
    {
      content: 'Which findings at an IV site suggest phlebitis?',
      options: [
        'Redness, heat, and swelling, with a hard (indurated) vein and pain',
        'Coolness, pallor, and swelling',
        'Blood backing up into the tubing when the bag is lowered',
        'A drip chamber less than half full',
      ],
      correct_index: 0,
      explanation:
        'Skill 15-3, step 11: redness, swelling, and heat, induration on palpation, and pain suggest phlebitis. Notify the primary care provider; the IV is discontinued and restarted at another site.',
    },
    {
      content: 'Which findings suggest fluid overload in a patient receiving IV fluids?',
      options: [
        'Thirst, dry mucous membranes, and dark urine',
        'Redness and warmth along the vein above the site',
        'A slow pulse, cool hands, and low blood pressure',
        'Shortness of breath, edema, and abnormal lung sounds',
      ],
      correct_index: 3,
      explanation:
        'Skill 15-3, step 13a: fluid overload can lead to cardiac or respiratory failure. Monitor intake and output and vital signs, assess for edema, auscultate lung sounds, and ask about shortness of breath.',
    },
  ],
  '15-4': [
    {
      content: 'As the old peripheral IV dressing is removed, what does the nurse do with the catheter?',
      options: [
        'Holds it in place with the nondominant hand',
        'Pulls it back slightly to check for blood',
        'Clamps it with a hemostat',
        'Flushes it with saline first',
      ],
      correct_index: 0,
      explanation:
        'Skill 15-4, step 5: hold the catheter in place with your nondominant hand and carefully remove the old dressing and securing device, using adhesive remover as needed.',
    },
    {
      content: 'How is chlorhexidine applied at the IV site during a dressing change?',
      options: [
        'Wiped on once and blotted dry',
        'A back-and-forth friction scrub for at least 30 seconds, left to dry completely without wiping or blotting',
        'Circles from the outside in, then fanned dry',
        'Sprayed on and covered straight away',
      ],
      correct_index: 1,
      explanation:
        'Skill 15-4, step 7: apply chlorhexidine with a back-and-forth friction scrub for at least 30 seconds. Do not wipe or blot; allow it to dry completely.',
    },
    {
      content: 'What is written on the label of the new IV dressing?',
      options: [
        'The patient’s name and bed number',
        'The date, the time of the change, and the nurse’s initials',
        'The solution and its rate',
        'The catheter gauge only',
      ],
      correct_index: 1,
      explanation: 'Skill 15-4, step 9: label the dressing with the date, the time of change, and your initials.',
    },
    {
      content:
        'While the dressing is off, the nurse finds redness, warmth, and tenderness along the vein. What is done?',
      options: [
        'Apply the new dressing and recheck in 4 hours',
        'Discontinue the IV and relocate it',
        'Slow the infusion and elevate the arm',
        'Cover the site with an extra layer of gauze',
      ],
      correct_index: 1,
      explanation:
        'Skill 15-4, step 6: inspect the site for phlebitis, infection, or infiltration; if any is noted, discontinue and relocate the IV.',
    },
  ],
  '15-5': [
    {
      content: 'Before flushing a peripheral catheter that is being capped, how does the nurse check it is patent?',
      options: [
        'Pinches the extension tubing and watches for swelling',
        'Aspirates with the saline flush syringe for a positive blood return',
        'Lowers the arm below the heart and watches the tubing',
        'Opens the roller clamp and watches for backflow',
      ],
      correct_index: 1,
      explanation:
        'Skill 15-5, step 9: insert the saline flush syringe into the cap and pull back to aspirate for a positive blood return before instilling the flush.',
    },
    {
      content: 'How fast is the saline flush instilled into the capped peripheral catheter?',
      options: [
        'As a rapid push over 5 seconds',
        'Over 1 minute, or as facility policy directs',
        'Over 10 minutes, like an infusion',
        'By gravity, with the syringe plunger removed',
      ],
      correct_index: 1,
      explanation:
        'Skill 15-5, step 9: if there is a positive blood return, instill the solution over 1 minute or flush according to facility policy, then remove the syringe and reclamp the extension tubing.',
    },
    {
      content:
        'After the administration set is disconnected from the extension set, what is done before the flush syringe goes in?',
      options: [
        'The end cap is cleansed with an antimicrobial swab',
        'The cap is replaced with a sterile needle',
        'The extension tubing is left open to air',
        'The catheter is flushed with the old IV fluid',
      ],
      correct_index: 0,
      explanation:
        'Skill 15-5, step 8: remove the administration set tubing from the extension set and cleanse the end cap with an antimicrobial swab.',
    },
  ],
};
