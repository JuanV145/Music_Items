from routers.daw import router as daw_router
from routers.songs import router as songs_router


def route_signatures(router):
    return {
        (method, route.path)
        for route in router.routes
        for method in route.methods
        if method in {"GET", "POST", "PUT", "DELETE"}
    }


def test_songs_router_preserves_existing_routes():
    assert route_signatures(songs_router) == {
        ("POST", "/api/songs/"),
        ("GET", "/api/songs/"),
        ("GET", "/api/songs/{song_id}"),
        ("PUT", "/api/songs/{song_id}"),
        ("DELETE", "/api/songs/{song_id}"),
    }


def test_daw_router_preserves_existing_routes():
    assert route_signatures(daw_router) == {
        ("POST", "/api/daw/projects/"),
        ("GET", "/api/daw/projects/"),
        ("GET", "/api/daw/projects/{project_id}"),
        ("PUT", "/api/daw/projects/{project_id}"),
        ("DELETE", "/api/daw/projects/{project_id}"),
        ("POST", "/api/daw/projects/{project_id}/tracks/"),
        ("GET", "/api/daw/projects/{project_id}/tracks/"),
        ("GET", "/api/daw/tracks/{track_id}"),
        ("PUT", "/api/daw/tracks/{track_id}"),
        ("DELETE", "/api/daw/tracks/{track_id}"),
    }
