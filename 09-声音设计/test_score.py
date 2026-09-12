import copy
import json
import tempfile
import unittest
from pathlib import Path

import build_score as bs  # 先导入，其内部把 07-技术验证 加入模块搜索路径
import nesting
import render_score as rs


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


class ScoreTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = nesting.read(nesting.AI / 'output.example-手工占位.json')
        cls.score = bs.build(cls.output, '测试来源')
        nesting.validate_schema(cls.score, nesting.read(bs.SCORE_DIR / 'score.schema.json'))

    def test_valid_against_schema(self):
        nesting.validate_schema(self.score, nesting.read(bs.SCORE_DIR / 'score.schema.json'))

    def test_deterministic(self):
        other = bs.build(copy.deepcopy(self.output), '测试来源')
        self.assertEqual(canonical(self.score), canonical(other))

    def test_phase_structure(self):
        self.assertEqual([p['id'] for p in self.score['phases']],
                         ['calm', 'swarm-a', 'swarm-b', 'weave', 'settle', 'residual'])
        bounds = [(p['start'], p['end']) for p in self.score['phases']]
        self.assertEqual(bounds, [(0, 8), (8, 20), (20, 32), (32, 47), (47, 57), (57, 60)])
        for (_, end), (start, _) in zip(bounds, bounds[1:]):
            self.assertEqual(end, start)

    def test_texture_density_follows_energy(self):
        # 03：声音首轮仅随 energy 调整纹理密度。
        rates = {layer['id']: layer['grain_rate'] for layer in self.score['layers']}
        events = {event['id']: event for event in self.output['events']}
        for side in ('a', 'b'):
            expected = round(2 + 14 * events[side]['energy'], 4)
            self.assertEqual(rates['swarm-' + side], expected)

    def test_deposit_count_matches_formula(self):
        weave = self.output['interaction']['weave']
        settle = self.output['interaction']['settle']
        # 取整与实现同源（half-up），与视觉 weave.js / 声音 audio.mjs 一致。
        expected = bs.round_half_up(bs.round_half_up(48 * weave) * settle)
        deposits = [e for e in self.score['events'] if e['cue'] == 'deposit']
        self.assertEqual(len(deposits), expected)  # round(38.4)=38, round(38 × 0.65)=25
        for event in deposits:
            self.assertGreaterEqual(event['t'], 47)
            self.assertLess(event['t'], 57)

    def test_round_half_up_matches_js_semantics(self):
        # .5 一律进位，与 weave.js / audio.mjs 的 roundHalfUp 一致。
        for value, expected in [(0.0, 0), (0.5, 1), (4.5, 5), (22.5, 23),
                                (24.7, 25), (34.5, 35), (48.0, 48)]:
            with self.subTest(value=value):
                self.assertEqual(bs.round_half_up(value), expected)
        # 记录内置 round 的银行家舍入行为：若有人把实现改回 round()，本断言会失败。
        self.assertEqual(round(22.5), 22)
        self.assertEqual(round(34.5), 34)

    def test_counts_use_half_up_at_dot_five_boundary(self):
        # 48 × 0.46875 = 22.5 是 Py/JS 取整分歧点：两端必须都得 23，否则沉积节拍失配。
        at_half = copy.deepcopy(self.output)
        at_half['interaction']['weave'] = 0.46875
        at_half['interaction']['settle'] = 1.0
        score = bs.build(at_half, '取整边界测试')
        deposits = [e for e in score['events'] if e['cue'] == 'deposit']
        self.assertEqual(len(deposits), 23)
        self.assertEqual(len(score['events']), 6 + 23)

    def test_r4_matches_js_four_decimal_rounding(self):
        # 四位小数舍入也必须是 half-up，与 audio.mjs 的 Math.round(x*1e4)/1e4 同解；
        # 若改回内置 round(value, 4)（银行家舍入），第五位为 5 时两端会不一致。
        for value, expected in [(5.5, 5.5), (8.3, 8.3), (47.2, 47.2),
                                (0.12345, 0.1235), (0.12335, 0.1234), (1.00005, 1.0001)]:
            with self.subTest(value=value):
                self.assertEqual(bs.r4(value), expected)

    def test_phase_table_consistent_across_modules(self):
        """相位表目前有 3 份独立副本（本模块、交互 session.mjs、视觉 config.js）。

        收敛为单一来源需要让浏览器端从 JSON 异步读取，会改动同步加载的共享 config，
        故先以本测试充当守卫：任一副本被改动而其它未同步时立刻失败。
        """
        import re
        pattern = re.compile(
            r"(?:id|name):\s*'([A-Za-z0-9_-]+)',\s*start:\s*([\d.]+),\s*end:\s*([\d.]+)")

        def boundaries(relative_path):
            text = (nesting.ROOT / relative_path).read_text(encoding='utf-8')
            return [(float(start), float(end)) for _, start, end in pattern.findall(text)]

        expected = [(float(start), float(end)) for _, start, end, _ in bs.PHASES]
        self.assertEqual(len(expected), 6)
        self.assertEqual(boundaries('web/interaction/session.mjs'), expected,
                         'session.mjs 的 PHASES 与 build_score.PHASES 边界不一致')
        self.assertEqual(boundaries('web/visual/js/config.js'), expected,
                         'config.js 的 TIMELINE.phases 与 build_score.PHASES 边界不一致')

    def test_max_parameters_build_and_pass_schema(self):
        # 最坏情况：weave=1.0 / settle=1.0 → 48 个沉积 + 6 个 cue = 54 条事件。
        # 该 output 本身合法，因此 score schema 的事件上限必须容得下它。
        at_max = copy.deepcopy(self.output)
        at_max['interaction']['weave'] = 1.0
        at_max['interaction']['settle'] = 1.0
        nesting.validate_schema(at_max, nesting.read(nesting.AI / 'output.schema.json'))
        score = bs.build(at_max, '满参数测试')
        nesting.validate_schema(score, nesting.read(bs.SCORE_DIR / 'score.schema.json'))
        deposits = [e for e in score['events'] if e['cue'] == 'deposit']
        self.assertEqual(len(deposits), 48)
        self.assertEqual(len(score['events']), 54)
        for event in deposits:
            self.assertGreaterEqual(event['t'], 47)
            self.assertLess(event['t'], 57)

    def test_cue_events_at_storyboard_beats(self):
        cues = {e['cue']: e['t'] for e in self.score['events'] if e['cue'] != 'deposit'}
        self.assertEqual(cues, {'showcase-start': 0, 'swarm-a-enter': 8, 'swarm-b-enter': 20,
                                'weave-start': 32, 'settle-start': 47, 'residual-start': 57})

    def test_master_gain_enforces_loudness_cap(self):
        layers = self.score['layers']
        points = sorted({0.0, 60.0} | {item['start'] for item in layers} | {item['end'] for item in layers})
        for left, right in zip(points, points[1:]):
            middle = (left + right) / 2
            concurrent = sum(item['gain'] for item in layers
                             if item['start'] <= middle <= item['end'])
            self.assertLessEqual(concurrent * self.score['master_gain'], 0.8 + 1e-9)

    def test_invalid_output_rejected(self):
        for mutate in [lambda o: o['events'].pop(), lambda o: o.update(extra=1),
                       lambda o: o['interaction'].update(weave=-0.1)]:
            with self.subTest(), self.assertRaises(nesting.Invalid):
                bad = copy.deepcopy(self.output)
                mutate(bad)
                nesting.validate_schema(bad, nesting.read(nesting.AI / 'output.schema.json'))

    def test_invalid_score_rejected(self):
        schema = nesting.read(bs.SCORE_DIR / 'score.schema.json')
        variants = []
        bad = copy.deepcopy(self.score); bad['phases'].pop(); variants.append(bad)
        bad = copy.deepcopy(self.score); bad['layers'][0]['gain'] = 1.5; variants.append(bad)
        bad = copy.deepcopy(self.score); bad['master_gain'] = '0.8'; variants.append(bad)
        bad = copy.deepcopy(self.score); del bad['notes']; variants.append(bad)
        bad = copy.deepcopy(self.score); bad['derived_from']['source'] = ''; variants.append(bad)
        for bad in variants:
            with self.subTest(), self.assertRaises(nesting.Invalid):
                nesting.validate_schema(bad, schema)

    def test_load_output_cross_checks_source(self):
        with tempfile.TemporaryDirectory() as folder:
            source_path = Path(folder) / 'input.json'
            source_path.write_text(
                json.dumps(nesting.read(nesting.AI / 'input.example.json'), ensure_ascii=False),
                encoding='utf-8')
            checked = bs.load_output(nesting.AI / 'output.example-手工占位.json', source_path)
            self.assertEqual(checked, self.output)
            reversed_output = copy.deepcopy(self.output)
            reversed_output['events'].reverse()
            bad_path = Path(folder) / 'output.json'
            bad_path.write_text(json.dumps(reversed_output, ensure_ascii=False), encoding='utf-8')
            with self.assertRaises(nesting.Invalid):
                bs.load_output(bad_path, source_path)

    def test_render_short_window(self):
        buf = rs.render_samples(self.score, seconds=3)
        self.assertEqual(len(buf), 3 * rs.SAMPLE_RATE)
        peak = max(abs(value) for value in buf)
        self.assertLessEqual(peak, 1.0)
        self.assertGreater(peak, 0.01)

    def test_render_deterministic(self):
        first = rs.render_samples(self.score, seconds=2).tobytes()
        second = rs.render_samples(self.score, seconds=2).tobytes()
        self.assertEqual(first, second)

    def test_render_full_matches_duration(self):
        buf = rs.render_samples(self.score)
        self.assertEqual(len(buf), 60 * rs.SAMPLE_RATE)
        self.assertLessEqual(max(abs(value) for value in buf), 1.0)

    def test_render_rejects_bad_score(self):
        bad = copy.deepcopy(self.score)
        bad['phases'] = bad['phases'][:3]
        with self.assertRaises(nesting.Invalid):
            rs.render_samples(bad)


if __name__ == '__main__':
    unittest.main(verbosity=2)
