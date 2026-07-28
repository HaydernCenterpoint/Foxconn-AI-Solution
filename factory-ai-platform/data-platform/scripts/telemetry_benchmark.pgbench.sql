\set machine_no random(1, :machines)
\set metric_no random(1, :metrics)

SELECT
    time_bucket('1 hour', time) AS bucket,
    AVG(value) AS avg_value
FROM telemetry
WHERE asset_id = md5('fii-timescale-workload-v1-' || :machine_no::text)::uuid
  AND metric = (
      ARRAY[
          'temperature',
          'vibration',
          'current_draw',
          'pressure',
          'flow_rate',
          'speed',
          'torque',
          'power',
          'oee',
          'yield_rate'
      ]
  )[:metric_no]
  AND time >= NOW() - make_interval(days => :days)
GROUP BY 1
ORDER BY 1 DESC;
