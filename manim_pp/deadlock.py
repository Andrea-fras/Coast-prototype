from manim import *

class DeadlockVisualization(Scene):
    """Show how two threads holding locks the other needs creates deadlock."""
    def construct(self):
        self.camera.background_color = "#1a1a2e"

        title = Text("Deadlock", font_size=36, color=WHITE).to_edge(UP, buff=0.4)
        self.play(Write(title))

        lock_a = RoundedRectangle(
            width=1.8, height=1.0, corner_radius=0.1,
            color=YELLOW, fill_color=YELLOW, fill_opacity=0.1
        ).move_to(LEFT * 2 + UP * 0.5)
        lock_a_icon = Text("🔒", font_size=28).move_to(lock_a.get_center() + UP * 0.1)
        lock_a_label = Text("Lock A", font_size=18, color=YELLOW).move_to(lock_a.get_center() + DOWN * 0.25)

        lock_b = RoundedRectangle(
            width=1.8, height=1.0, corner_radius=0.1,
            color=TEAL_C, fill_color=TEAL_C, fill_opacity=0.1
        ).move_to(RIGHT * 2 + UP * 0.5)
        lock_b_icon = Text("🔒", font_size=28).move_to(lock_b.get_center() + UP * 0.1)
        lock_b_label = Text("Lock B", font_size=18, color=TEAL_C).move_to(lock_b.get_center() + DOWN * 0.25)

        self.play(
            FadeIn(lock_a), Write(lock_a_icon), Write(lock_a_label),
            FadeIn(lock_b), Write(lock_b_icon), Write(lock_b_label),
        )

        t1 = RoundedRectangle(
            width=2.0, height=0.8, corner_radius=0.1,
            color=RED_C, fill_color=RED_C, fill_opacity=0.2
        ).move_to(LEFT * 3.5 + DOWN * 1.5)
        t1_label = Text("Thread 1", font_size=18, color=RED_C).move_to(t1.get_center())

        t2 = RoundedRectangle(
            width=2.0, height=0.8, corner_radius=0.1,
            color=GREEN_C, fill_color=GREEN_C, fill_opacity=0.2
        ).move_to(RIGHT * 3.5 + DOWN * 1.5)
        t2_label = Text("Thread 2", font_size=18, color=GREEN_C).move_to(t2.get_center())

        self.play(FadeIn(t1), Write(t1_label), FadeIn(t2), Write(t2_label))

        holds_1 = Arrow(t1.get_top(), lock_a.get_bottom(), color=RED_C, buff=0.1, stroke_width=3)
        holds_1_lbl = Text("holds", font_size=14, color=RED_C).move_to(holds_1.get_center() + LEFT * 0.4)
        self.play(GrowArrow(holds_1), Write(holds_1_lbl), run_time=0.7)

        holds_2 = Arrow(t2.get_top(), lock_b.get_bottom(), color=GREEN_C, buff=0.1, stroke_width=3)
        holds_2_lbl = Text("holds", font_size=14, color=GREEN_C).move_to(holds_2.get_center() + RIGHT * 0.4)
        self.play(GrowArrow(holds_2), Write(holds_2_lbl), run_time=0.7)

        wants_1 = Arrow(
            t1.get_right() + UP * 0.15, lock_b.get_left() + DOWN * 0.2,
            color=RED_C, buff=0.1, stroke_width=3, stroke_opacity=0.6,
            max_tip_length_to_length_ratio=0.15
        )
        wants_1_lbl = Text("waits for", font_size=14, color=RED_C).move_to(
            (t1.get_right() + lock_b.get_left()) / 2 + DOWN * 0.6
        )

        wants_2 = Arrow(
            t2.get_left() + UP * 0.15, lock_a.get_right() + DOWN * 0.2,
            color=GREEN_C, buff=0.1, stroke_width=3, stroke_opacity=0.6,
            max_tip_length_to_length_ratio=0.15
        )
        wants_2_lbl = Text("waits for", font_size=14, color=GREEN_C).move_to(
            (t2.get_left() + lock_a.get_right()) / 2 + DOWN * 0.6
        )

        self.play(
            GrowArrow(wants_1), Write(wants_1_lbl),
            GrowArrow(wants_2), Write(wants_2_lbl),
            run_time=1.0
        )

        cycle_pts = [
            t1.get_top() + RIGHT * 0.3,
            lock_a.get_bottom() + RIGHT * 0.2,
            lock_a.get_right(),
            lock_b.get_left(),
            lock_b.get_bottom() + LEFT * 0.2,
            t2.get_top() + LEFT * 0.3,
            t2.get_left() + UP * 0.1,
            t1.get_right() + UP * 0.1,
        ]

        deadlock_text = Text("DEADLOCK!", font_size=40, color=RED, weight=BOLD)
        deadlock_text.to_edge(DOWN, buff=1.2)
        self.play(Write(deadlock_text))

        cycle_border = SurroundingRectangle(
            VGroup(lock_a, lock_b, t1, t2), color=RED, buff=0.3, corner_radius=0.2, stroke_width=2
        )
        self.play(Create(cycle_border), run_time=0.8)

        for _ in range(3):
            self.play(cycle_border.animate.set_color(YELLOW), run_time=0.3)
            self.play(cycle_border.animate.set_color(RED), run_time=0.3)

        explain = Text(
            "Circular wait: each thread holds what the other needs",
            font_size=18, color=GREY_B
        ).to_edge(DOWN, buff=0.4)
        self.play(Write(explain))
        self.wait(2)
