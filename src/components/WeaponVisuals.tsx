import React from 'react';
import {CourseResource, UpgradePattern, UpgradeStep} from '../game/types';

export const UpgradeStepIcon: React.FC<{step: UpgradeStep}> = ({step}) => {
  if (step.kind === 'weapon_unlock') {
    switch (step.weaponId) {
      case 'twin':
        return (
          <svg viewBox="0 0 36 24" className="w-7 h-5">
            <rect x="4" y="6" width="24" height="3" rx="1.5" fill="#38BDF8" />
            <rect x="4" y="15" width="24" height="3" rx="1.5" fill="#38BDF8" />
            <polygon points="32,7.5 26,4.5 26,10.5" fill="#BAE6FD" />
            <polygon points="32,16.5 26,13.5 26,19.5" fill="#BAE6FD" />
          </svg>
        );
      case 'three_way':
        return (
          <svg viewBox="0 0 36 24" className="w-7 h-5">
            <line x1="6" y1="12" x2="29" y2="12" stroke="#818CF8" strokeWidth="2.4" strokeLinecap="round" />
            <line x1="6" y1="12" x2="27" y2="4" stroke="#818CF8" strokeWidth="2.4" strokeLinecap="round" />
            <line x1="6" y1="12" x2="27" y2="20" stroke="#818CF8" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="29" cy="12" r="2" fill="#E0E7FF" />
            <circle cx="27" cy="4" r="2" fill="#E0E7FF" />
            <circle cx="27" cy="20" r="2" fill="#E0E7FF" />
          </svg>
        );
      case 'cross_laser':
        return (
          <svg viewBox="0 0 36 24" className="w-7 h-5">
            <path
              d="M4,12 Q11,3 18,12 T32,12"
              fill="none"
              stroke="#A78BFA"
              strokeWidth="2.3"
              strokeLinecap="round"
            />
            <path
              d="M4,12 Q11,21 18,12 T32,12"
              fill="none"
              stroke="#DDD6FE"
              strokeWidth="2.3"
              strokeLinecap="round"
            />
          </svg>
        );
      case 'back_shot':
        return (
          <svg viewBox="0 0 36 24" className="w-7 h-5">
            <line x1="27" y1="8" x2="7" y2="8" stroke="#FB7185" strokeWidth="2.4" strokeLinecap="round" />
            <line x1="27" y1="16" x2="7" y2="16" stroke="#FB7185" strokeWidth="2.4" strokeLinecap="round" />
            <polygon points="4,8 10,5 10,11" fill="#FFE4E6" />
            <polygon points="4,16 10,13 10,19" fill="#FFE4E6" />
          </svg>
        );
      case 'laser':
        return (
          <svg viewBox="0 0 36 24" className="w-7 h-5">
            <rect x="3" y="8" width="30" height="8" rx="2" fill="#F43F5E" opacity="0.6" />
            <rect x="4" y="10.5" width="28" height="3" rx="1" fill="#FFFFFF" />
          </svg>
        );
      case 'ripple':
        return (
          <svg viewBox="0 0 36 24" className="w-7 h-5">
            <ellipse cx="10" cy="12" rx="3" ry="5" fill="none" stroke="#10B981" strokeWidth="2" />
            <ellipse cx="22" cy="12" rx="5" ry="9" fill="none" stroke="#34D399" strokeWidth="2.2" />
          </svg>
        );
      case 'missile':
        return (
          <svg viewBox="0 0 36 24" className="w-7 h-5">
            <path d="M5,11 Q12,4 22,4 L30,4" fill="none" stroke="#F59E0B" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M5,13 Q12,20 22,20 L30,20" fill="none" stroke="#F59E0B" strokeWidth="2.2" strokeLinecap="round" />
            <polygon points="32,4 27,1.5 27,6.5" fill="#FEF3C7" />
            <polygon points="32,20 27,17.5 27,22.5" fill="#FEF3C7" />
          </svg>
        );
      case 'orbit':
        return (
          <svg viewBox="0 0 36 24" className="w-7 h-5">
            <circle cx="18" cy="12" r="8.5" fill="none" stroke="#FB923C" strokeWidth="1.3" strokeDasharray="3 2" />
            <circle cx="18" cy="12" r="2.5" fill="#22D3EE" />
            <circle cx="18" cy="3.5" r="2.6" fill="#FB923C" />
            <circle cx="18" cy="20.5" r="2.6" fill="#FB923C" />
            <circle cx="9.5" cy="12" r="2.4" fill="#FDBA74" />
            <circle cx="26.5" cy="12" r="2.4" fill="#FDBA74" />
          </svg>
        );
      case 'drone':
        return (
          <svg viewBox="0 0 36 24" className="w-7 h-5">
            <polygon points="15,12 7,8 7,16" fill="#22D3EE" />
            <polygon points="28,7 20,4 20,10" fill="#67E8F9" />
            <polygon points="28,17 20,14 20,20" fill="#67E8F9" />
          </svg>
        );
      default:
        return null;
    }
  }

  if (step.kind === 'shield') {
    return (
      <svg viewBox="0 0 36 24" className="w-7 h-5">
        <path
          d="M18,3 L27,6.5 V12 C27,17 22.8,20.4 18,22 C13.2,20.4 9,17 9,12 V6.5 Z"
          fill="#1D4ED8"
          fillOpacity="0.45"
          stroke="#60A5FA"
          strokeWidth="2"
        />
      </svg>
    );
  }

  if (step.kind === 'bullet_size') {
    return (
      <svg viewBox="0 0 36 24" className="w-7 h-5">
        <circle cx="11" cy="12" r="3" fill="#34D399" opacity="0.6" />
        <circle cx="24" cy="12" r="6.5" fill="#34D399" stroke="#D1FAE5" strokeWidth="1.5" />
      </svg>
    );
  }

  if (step.kind === 'fire_rate') {
    return (
      <svg viewBox="0 0 36 24" className="w-7 h-5">
        <polygon points="10,6 18,12 10,18" fill="#22D3EE" />
        <polygon points="19,6 27,12 19,18" fill="#67E8F9" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 36 24" className="w-7 h-5">
      <polygon points="18,3 22,10 29,11 23,16 25,22 18,18.5 11,22 13,16 7,11 14,10" fill="#FB7185" />
    </svg>
  );
};

export const PatternMiniDiagram: React.FC<{
  pattern: UpgradePattern;
  className?: string;
}> = ({pattern, className}) => {
  const hasTwin = pattern.steps.some((s) => s.weaponId === 'twin');
  const hasThreeWay = pattern.steps.some((s) => s.weaponId === 'three_way');
  const hasCrossLaser = pattern.steps.some((s) => s.weaponId === 'cross_laser');
  const backShotCount = pattern.steps.filter((s) => s.weaponId === 'back_shot').length;
  const laserCount = pattern.steps.filter((s) => s.weaponId === 'laser').length;
  const hasBackShot = backShotCount > 0;
  const hasLaser = laserCount > 0;
  const isMegaLaser = laserCount >= 3;
  const isBackThreeWay = backShotCount >= 3;
  const hasRipple = pattern.steps.some((s) => s.weaponId === 'ripple');
  const hasMissile = pattern.steps.some((s) => s.weaponId === 'missile');
  const hasOrbit = pattern.steps.some((s) => s.weaponId === 'orbit');
  const hasDrone = pattern.steps.some((s) => s.weaponId === 'drone');

  return (
    <svg
      viewBox="0 0 240 76"
      className={
        className ??
        'w-full h-20 bg-[#050914] rounded border border-slate-800/80'
      }
    >
      <line x1="0" y1="38" x2="240" y2="38" stroke="#1E293B" strokeDasharray="3 3" strokeWidth="1" />

      {hasOrbit && (
        <g>
          <circle cx="48" cy="38" r="21" fill="none" stroke="#FB923C" strokeOpacity="0.45" strokeDasharray="3 2" />
          <circle cx="48" cy="17" r="3" fill="#FB923C" />
          <circle cx="48" cy="59" r="3" fill="#FB923C" />
          <circle cx="27" cy="38" r="3" fill="#FB923C" />
          <circle cx="69" cy="38" r="3" fill="#FB923C" />
        </g>
      )}

      {hasDrone && (
        <g>
          <polygon points="40,18 31,14 31,22" fill="#67E8F9" />
          <polygon points="40,58 31,54 31,62" fill="#67E8F9" />
          <line x1="44" y1="18" x2="215" y2="18" stroke="#67E8F9" strokeWidth="1.4" strokeDasharray="6 4" />
          <line x1="44" y1="58" x2="215" y2="58" stroke="#67E8F9" strokeWidth="1.4" strokeDasharray="6 4" />
        </g>
      )}

      {hasBackShot && (
        isBackThreeWay ? (
          <g>
            <line x1="36" y1="38" x2="7" y2="38" stroke="#FB7185" strokeWidth="2.4" />
            <line x1="36" y1="38" x2="9" y2="17" stroke="#FB7185" strokeWidth="2.3" />
            <line x1="36" y1="38" x2="9" y2="59" stroke="#FB7185" strokeWidth="2.3" />
            <circle cx="7" cy="38" r="2.2" fill="#FFE4E6" />
            <circle cx="9" cy="17" r="2.2" fill="#FFE4E6" />
            <circle cx="9" cy="59" r="2.2" fill="#FFE4E6" />
          </g>
        ) : (
          <g>
            <line x1="36" y1="32" x2="10" y2="32" stroke="#FB7185" strokeWidth="2.4" strokeDasharray="8 4" />
            <line x1="36" y1="44" x2="10" y2="44" stroke="#FB7185" strokeWidth="2.4" strokeDasharray="8 4" />
            <polygon points="4,32 11,28.5 11,35.5" fill="#FFE4E6" />
            <polygon points="4,44 11,40.5 11,47.5" fill="#FFE4E6" />
          </g>
        )
      )}

      {hasTwin && (
        <g>
          <line x1="66" y1="33" x2="225" y2="33" stroke="#38BDF8" strokeWidth="2.2" strokeDasharray="9 5" />
          <line x1="66" y1="43" x2="225" y2="43" stroke="#38BDF8" strokeWidth="2.2" strokeDasharray="9 5" />
        </g>
      )}

      {hasThreeWay && (
        <g>
          <line x1="64" y1="38" x2="220" y2="38" stroke="#818CF8" strokeWidth="2.2" />
          <line x1="64" y1="38" x2="210" y2="11" stroke="#818CF8" strokeWidth="2.2" />
          <line x1="64" y1="38" x2="210" y2="65" stroke="#818CF8" strokeWidth="2.2" />
        </g>
      )}

      {hasCrossLaser && (
        <g>
          <path
            d="M64,38 Q84,16 104,38 T144,38 T184,38 T224,38"
            fill="none"
            stroke="#A78BFA"
            strokeWidth="2.4"
          />
          <path
            d="M64,38 Q84,60 104,38 T144,38 T184,38 T224,38"
            fill="none"
            stroke="#DDD6FE"
            strokeWidth="2.4"
          />
        </g>
      )}

      {hasLaser && (
        isMegaLaser ? (
          <g>
            <rect x="66" y="29" width="166" height="18" rx="4" fill="#F43F5E" opacity="0.55" />
            <rect x="66" y="32.5" width="166" height="11" rx="3" fill="#FDA4AF" opacity="0.85" />
            <rect x="66" y="35.5" width="166" height="5" rx="1.5" fill="#FFFFFF" />
          </g>
        ) : (
          <g>
            <rect x="68" y="34.5" width="158" height="7" rx="2" fill="#F43F5E" opacity="0.7" />
            <rect x="68" y="36.8" width="158" height="2.4" fill="#FFFFFF" />
          </g>
        )
      )}

      {hasRipple && (
        <g>
          <ellipse cx="108" cy="38" rx="4.5" ry="10" fill="none" stroke="#10B981" strokeWidth="2" />
          <ellipse cx="152" cy="38" rx="6.5" ry="15" fill="none" stroke="#10B981" strokeWidth="2.2" />
          <ellipse cx="202" cy="38" rx="8.5" ry="21" fill="none" stroke="#34D399" strokeWidth="2.4" />
        </g>
      )}

      {hasMissile && (
        <g>
          <path d="M52,32 Q84,10 128,10 L220,10" fill="none" stroke="#F59E0B" strokeWidth="2.2" />
          <path d="M52,44 Q84,66 128,66 L220,66" fill="none" stroke="#F59E0B" strokeWidth="2.2" />
          <polygon points="225,10 217,6.5 217,13.5" fill="#FEF3C7" />
          <polygon points="225,66 217,62.5 217,69.5" fill="#FEF3C7" />
        </g>
      )}

      {/* ARROW-01 */}
      <polygon points="62,38 38,28 43,38 38,48" fill="#0E7490" stroke="#22D3EE" strokeWidth="2" />
      <circle cx="48" cy="38" r="2" fill="#FFFFFF" />
    </svg>
  );
};

export const CoursePreviewSvg: React.FC<{course: CourseResource}> = ({
  course,
}) => {
  return (
    <svg
      viewBox="0 0 180 56"
      className="w-full h-14 rounded border border-slate-800/90"
      style={{background: `linear-gradient(180deg, ${course.skyTop}, ${course.skyBottom})`}}
    >
      {/* Course-specific backdrop silhouette */}
      {course.id === 'neon_city' && (
        <g>
          <rect x="8" y="28" width="16" height="28" fill="#0B1426" />
          <rect x="28" y="20" width="14" height="36" fill="#0B1426" />
          <rect x="46" y="32" width="20" height="24" fill="#0B1426" />
          <rect x="72" y="24" width="16" height="32" fill="#0B1426" />
          <line x1="0" y1="50" x2="180" y2="50" stroke="#22D3EE" strokeOpacity="0.45" strokeWidth="1" />
          <rect x="30" y="23" width="10" height="2" fill="#22D3EE" fillOpacity="0.6" />
          <rect x="74" y="27" width="12" height="2" fill="#22D3EE" fillOpacity="0.5" />
          {/* Cruiser Boss Silhouette */}
          <polygon points="122,28 136,12 162,9 170,21 170,35 162,47 136,44" fill="#1E293B" stroke="#38BDF8" strokeWidth="1.6" />
          <circle cx="142" cy="28" r="4" fill="#38BDF8" />
        </g>
      )}

      {course.id === 'foundry' && (
        <g>
          <rect x="0" y="0" width="180" height="6" fill="#29110B" />
          <rect x="16" y="6" width="8" height="14" fill="#29110B" />
          <rect x="64" y="6" width="8" height="10" fill="#29110B" />
          <rect x="14" y="34" width="18" height="22" fill="#1E0D0B" />
          <rect x="40" y="26" width="12" height="30" fill="#1E0D0B" />
          <rect x="62" y="36" width="24" height="20" fill="#1E0D0B" />
          <rect x="0" y="51" width="180" height="5" fill="#F97316" fillOpacity="0.45" />
          {/* Dreadnought Boss Silhouette */}
          <polygon points="124,14 166,14 166,42 124,42 116,35 130,35 130,21 116,21" fill="#291815" stroke="#F59E0B" strokeWidth="1.6" />
          <rect x="138" y="23" width="10" height="10" fill="#F97316" />
        </g>
      )}

      {course.id === 'cyber_vault' && (
        <g>
          <line x1="0" y1="44" x2="180" y2="44" stroke="#10B981" strokeOpacity="0.35" strokeWidth="1" />
          <line x1="0" y1="12" x2="180" y2="12" stroke="#10B981" strokeOpacity="0.35" strokeWidth="1" />
          <line x1="25" y1="0" x2="25" y2="56" stroke="#34D399" strokeOpacity="0.22" strokeWidth="1" />
          <line x1="58" y1="0" x2="58" y2="56" stroke="#34D399" strokeOpacity="0.22" strokeWidth="1" />
          <line x1="90" y1="0" x2="90" y2="56" stroke="#34D399" strokeOpacity="0.22" strokeWidth="1" />
          <polygon points="40,28 48,22 56,28 48,34" fill="none" stroke="#34D399" strokeOpacity="0.45" />
          {/* Mantis Boss Silhouette */}
          <polygon points="116,12 142,20 168,14 156,28 168,42 142,36 116,44 132,28" fill="#062822" stroke="#34D399" strokeWidth="1.6" />
          <polygon points="136,28 142,24 148,28 142,32" fill="#6EE7B7" />
        </g>
      )}

      {course.id === 'orbital' && (
        <g>
          <circle cx="24" cy="14" r="1" fill="#E2E8F0" />
          <circle cx="62" cy="22" r="1.2" fill="#E2E8F0" />
          <circle cx="88" cy="11" r="1" fill="#C4B5FD" />
          <path d="M-10,56 Q90,34 190,56" fill="none" stroke="#8B5CF6" strokeOpacity="0.6" strokeWidth="2.2" />
          <line x1="48" y1="0" x2="48" y2="56" stroke="#6366F1" strokeOpacity="0.35" strokeWidth="3" />
          {/* Citadel Boss Silhouette */}
          <polygon points="132,28 140,14 156,14 164,28 156,42 140,42" fill="#171030" stroke="#A78BFA" strokeWidth="1.6" />
          <circle cx="127" cy="13" r="3" fill="#A78BFA" />
          <circle cx="127" cy="43" r="3" fill="#A78BFA" />
          <circle cx="169" cy="13" r="3" fill="#A78BFA" />
          <circle cx="169" cy="43" r="3" fill="#A78BFA" />
          <circle cx="148" cy="28" r="4.5" fill="#DDD6FE" />
        </g>
      )}
    </svg>
  );
};

