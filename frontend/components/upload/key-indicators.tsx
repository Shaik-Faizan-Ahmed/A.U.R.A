"use client"

interface KeyIndicatorsProps {
  results: any
  fileType: 'image' | 'video'
}

export default function KeyIndicators({ results, fileType }: KeyIndicatorsProps) {
  const indicators: string[] = []

  if (fileType === 'image') {
    const breakdown = results.analysis_breakdown || {}

    if (breakdown.neural_network) {
      const nn = breakdown.neural_network
      if (nn.model_agreement === 'unanimous' || nn.model_agreement === 'strong_agreement') {
        indicators.push(`Strong agreement across ${nn.num_models} neural models`)
      } else if (nn.model_agreement === 'disagreement') {
        indicators.push('Conflicting predictions between neural models')
      }
      
      if (nn.score > 0.65) {
        indicators.push('Multiple deepfake detection models flagged this content')
      }
    }

    if (breakdown.frequency_domain) {
      const freq = breakdown.frequency_domain
      if (freq.dct_anomaly) {
        indicators.push('DCT frequency anomalies detected')
      }
      if (freq.fft_anomaly) {
        indicators.push('FFT patterns suggest synthetic generation')
      }
      if (freq.high_freq_score && freq.high_freq_score > 0.7) {
        indicators.push('Unusual high-frequency artifacts present')
      }
    }

    if (breakdown.facial_analysis && breakdown.facial_analysis.face_detected) {
      const face = breakdown.facial_analysis
      if (face.symmetry_anomaly) {
        indicators.push('Facial asymmetry exceeds natural variation')
      }
      if (face.eye_anomaly) {
        indicators.push('Eye region shows synthetic characteristics')
      }
      if (face.texture_anomaly) {
        indicators.push('Skin texture appears artificially smooth or generated')
      }
    }

    if (breakdown.metadata_forensics) {
      const meta = breakdown.metadata_forensics
      if (!meta.exif_present) {
        indicators.push('No EXIF metadata found (may indicate processing)')
      }
      if (meta.ela_anomalies) {
        indicators.push('Compression mismatch detected between regions')
      }
      if (meta.exif_suspicious) {
        indicators.push('EXIF data contains suspicious patterns')
      }
    }
  } else {
    const layerSummaries = results.layer_summaries || {}
    const frameBasedMax = layerSummaries.visual?.frame_based?.ensemble_max || 0

    if (frameBasedMax > 0.95) {
      indicators.push('Single frame triggered a high-risk override')
    }

    if (layerSummaries.visual?.temporal) {
      const shifts = layerSummaries.visual.temporal.identity_shifts || 0
      if (shifts > 20) {
        indicators.push('Severe temporal identity instability across frames')
      }
    }

    if (layerSummaries.visual?.temporal?.motion_smoothness < 0.6) {
      indicators.push('High facial landmark jitter detected')
    }

    if (layerSummaries.visual?.frame_based?.frequency_avg > 0.7) {
      indicators.push('Strong frequency-domain anomalies')
    }

    if (layerSummaries.physics && !layerSummaries.physics.lighting_consistent) {
      indicators.push('Inconsistent physical lighting cues')
    }

    if (layerSummaries.physiological && !layerSummaries.physiological.natural_blink_pattern) {
      indicators.push('Unnatural blink pattern observed')
    }

    if (layerSummaries.visual?.temporal?.anomalies) {
      layerSummaries.visual.temporal.anomalies.slice(0, 2).forEach((anomaly: string) => {
        if (!indicators.some(ind => ind.toLowerCase().includes(anomaly.toLowerCase().split(' ')[0]))) {
          indicators.push(anomaly)
        }
      })
    }

    if (layerSummaries.physiological?.anomalies) {
      layerSummaries.physiological.anomalies.slice(0, 2).forEach((anomaly: string) => {
        const lowerAnomaly = anomaly.toLowerCase()
        if (!indicators.some(ind => 
          ind.toLowerCase().includes('heartbeat') && lowerAnomaly.includes('heartbeat') ||
          ind.toLowerCase().includes('blink') && lowerAnomaly.includes('blink')
        )) {
          indicators.push(anomaly)
        }
      })
    }

    if (layerSummaries.audio?.anomalies) {
      layerSummaries.audio.anomalies.slice(0, 1).forEach((anomaly: string) => {
        if (!indicators.some(ind => ind.toLowerCase().includes(anomaly.toLowerCase().split(' ')[0]))) {
          indicators.push(anomaly)
        }
      })
    }
  }

  const uniqueIndicators = Array.from(new Set(indicators)).slice(0, 6)

  if (uniqueIndicators.length === 0) {
    uniqueIndicators.push('No major suspicious indicators detected')
  }

  return (
    <div className="h-full flex flex-col justify-center space-y-6">
      <div>
        <h3 className="text-xl font-light tracking-[3px] uppercase text-white/90">
          Key Indicators
        </h3>
      </div>
      
      <div className="space-y-3">
        {uniqueIndicators.map((indicator, idx) => (
          <div key={idx} className="flex items-start gap-3 group">
            <span className="text-cyan-400/50 mt-0.5 group-hover:text-cyan-400 transition-colors">▸</span>
            <p className="text-sm text-white/70 leading-relaxed group-hover:text-white/90 transition-colors">
              {indicator}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
