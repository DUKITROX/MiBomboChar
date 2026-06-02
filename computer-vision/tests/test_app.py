def test_app_module_exports_time_for_run_server():
    import mibombo_cv.app as app

    assert app.time is not None
