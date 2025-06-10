# Dashboard Plugin

Displays a pseudo "Dashboard" section in your server that can be configured to show custom hubs.

## Hubs

- **letterboxd**:

	- **userFollowingActivity**: (*letterboxd username*)
		
		Films from a user's following activity on letterboxd.
		
		[Example](https://letterboxd.com/crew/activity/following/)
		```json
		{
			"plugin": "letterboxd",
			"hub": "userFollowingActivity",
			"arg": "crew"
		}
		```

	- **similar**: (*letterboxd metadata id*)

		Films similar to a given film on letterboxd.

		[Example](https://letterboxd.com/film/legend/similar/)
		```json
		{
			"plugin": "letterboxd",
			"hub": "similar",
			"arg": "film:legend"
		}
		```
