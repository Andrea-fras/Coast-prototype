from manim import *

class RaceCondition(Scene):
    """Show how two threads racing to update a shared variable cause incorrect results."""
    def construct(self):
        self.camera.background_color = "#1a1a2e"

        title = Text("Race Condition", font_size=36, color=WHITE).to_edge(UP, buff=0.4)
        self.play(Write(title))

        shared_box = RoundedRectangle(
            width=2.5, height=1.2, corner_radius=0.15,
            color=WHITE, fill_color=DARK_BLUE, fill_opacity=0.3
        ).move_to(ORIGIN + UP * 0.3)
        shared_label = Text("Shared Variable", font_size=16, color=GREY_B).move_to(shared_box.get_top() + DOWN * 0.25)
        counter_val = Text("count = 0", font_size=26, color=YELLOW).move_to(shared_box.get_center() + DOWN * 0.1)
        self.play(FadeIn(shared_box), Write(shared_label), Write(counter_val))

        t1_box = RoundedRectangle(width=2.2, height=0.8, corner_radius=0.1, color=RED_C, fill_color=RED_C, fill_opacity=0.15)
        t1_box.move_to(LEFT * 3.5 + DOWN * 1.8)
        t1_label = Text("Thread A", font_size=18, color=RED_C).move_to(t1_box.get_center())

        t2_box = RoundedRectangle(width=2.2, height=0.8, corner_radius=0.1, color=GREEN_C, fill_color=GREEN_C, fill_opacity=0.15)
        t2_box.move_to(RIGHT * 3.5 + DOWN * 1.8)
        t2_label = Text("Thread B", font_size=18, color=GREEN_C).move_to(t2_box.get_center())

        self.play(FadeIn(t1_box), Write(t1_label), FadeIn(t2_box), Write(t2_label))

        subtitle = Text("Both threads try: count = count + 1", font_size=20, color=GREY_B)
        subtitle.to_edge(DOWN, buff=1.8)
        self.play(Write(subtitle))
        self.wait(0.5)

        step_y = DOWN * 2.8
        steps = VGroup()

        def show_step(thread, action, thread_color, step_num, side):
            x = -3.5 if side == "left" else 3.5
            step_text = Text(f"{step_num}. {thread}: {action}", font_size=15, color=thread_color)
            step_text.move_to(np.array([x, -2.8 - step_num * 0.35, 0]))
            return step_text

        s1 = show_step("A", "read count → 0", RED_C, 1, "left")
        self.play(Write(s1), run_time=0.5)

        s2 = show_step("B", "read count → 0", GREEN_C, 1, "right")
        self.play(Write(s2), run_time=0.5)

        s3 = show_step("A", "compute 0 + 1 = 1", RED_C, 2, "left")
        self.play(Write(s3), run_time=0.5)

        s4 = show_step("B", "compute 0 + 1 = 1", GREEN_C, 2, "right")
        self.play(Write(s4), run_time=0.5)

        s5 = show_step("A", "write count ← 1", RED_C, 3, "left")
        new_val_1 = Text("count = 1", font_size=26, color=RED_C).move_to(counter_val.get_center())
        self.play(Write(s5), Transform(counter_val, new_val_1), run_time=0.6)

        s6 = show_step("B", "write count ← 1", GREEN_C, 3, "right")
        new_val_2 = Text("count = 1", font_size=26, color=GREEN_C).move_to(counter_val.get_center())
        self.play(Write(s6), Transform(counter_val, new_val_2), run_time=0.6)

        self.play(FadeOut(subtitle))

        wrong = Text("Expected: 2    Got: 1", font_size=24, color=RED)
        wrong.to_edge(DOWN, buff=0.4)
        cross = Text("✗ DATA RACE!", font_size=28, color=RED, weight=BOLD)
        cross.next_to(wrong, UP, buff=0.2)
        self.play(Write(cross), Write(wrong))

        flash_rect = SurroundingRectangle(shared_box, color=RED, buff=0.1, stroke_width=3)
        self.play(Create(flash_rect))
        self.play(flash_rect.animate.set_color(YELLOW), run_time=0.3)
        self.play(flash_rect.animate.set_color(RED), run_time=0.3)
        self.wait(2)
