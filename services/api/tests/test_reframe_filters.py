"""Unit tests for the ffmpeg filter strings built for each reframe mode
(app/worker/render/reframe.py::build_reframe_filter) — string assembly
only, no OpenCV/ffmpeg involved."""

from __future__ import annotations

from app.worker.render.reframe import build_reframe_filter


def test_center_mode_crops_to_target_dimensions():
    filt = build_reframe_filter("center", 1920, 1080)
    assert "crop=1080:1920" in filt
    assert "scale=1080:1920" in filt


def test_auto_mode_without_face_falls_back_to_center_crop():
    filt = build_reframe_filter("auto", 1920, 1080, face_center_x=None)
    assert filt == build_reframe_filter("center", 1920, 1080)


def test_auto_mode_with_face_biases_the_crop_x_offset():
    filt = build_reframe_filter("auto", 1920, 1080, face_center_x=0.2)
    assert "0.2" in filt
    assert "(iw-ow)/2" not in filt


def test_blur_mode_produces_a_filter_complex_with_overlay():
    filt = build_reframe_filter("blur", 1920, 1080)
    assert "split=2" in filt
    assert "overlay" in filt
    assert "gblur" in filt
