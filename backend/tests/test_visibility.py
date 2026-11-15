
import unittest


def visibility_percentage(observations):
    if not observations:
        raise ValueError("No observations provided")

    visible = sum(
        observation["above_geometric_horizon"]
        for observation in observations
    )

    return round(100 * visible / len(observations), 1)


def simultaneous_percentage(sun, earth):
    if not sun or len(sun) != len(earth):
        raise ValueError("Observation counts must match")

    for s, e in zip(sun, earth):
        if s["time_utc"] != e["time_utc"]:
            raise ValueError("Observation timestamps differ")

    visible = sum(
        s["above_geometric_horizon"]
        and e["above_geometric_horizon"]
        for s, e in zip(sun, earth)
    )

    return round(100 * visible / len(sun), 1)


class TestVisibility(unittest.TestCase):
    def test_all_visible(self):
        data = [
            {"above_geometric_horizon": True}
            for _ in range(13)
        ]
        self.assertEqual(visibility_percentage(data), 100.0)

    def test_partial_visibility(self):
        data = [
            {"above_geometric_horizon": True}
            for _ in range(9)
        ] + [
            {"above_geometric_horizon": False}
            for _ in range(4)
        ]
        self.assertEqual(visibility_percentage(data), 69.2)

    def test_none_visible(self):
        data = [
            {"above_geometric_horizon": False}
            for _ in range(13)
        ]
        self.assertEqual(visibility_percentage(data), 0.0)

    def test_simultaneous_visibility(self):
        times = [f"T{i}" for i in range(13)]

        sun = [
            {
                "time_utc": t,
                "above_geometric_horizon": True,
            }
            for t in times
        ]

        earth = [
            {
                "time_utc": t,
                "above_geometric_horizon": i < 9,
            }
            for i, t in enumerate(times)
        ]

        self.assertEqual(
            simultaneous_percentage(sun, earth),
            69.2,
        )

    def test_mismatched_timestamps(self):
        sun = [{
            "time_utc": "T1",
            "above_geometric_horizon": True,
        }]
        earth = [{
            "time_utc": "T2",
            "above_geometric_horizon": True,
        }]

        with self.assertRaises(ValueError):
            simultaneous_percentage(sun, earth)

    def test_empty_data(self):
        with self.assertRaises(ValueError):
            visibility_percentage([])


if __name__ == "__main__":
    unittest.main()
