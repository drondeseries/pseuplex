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

	- **similar**: (*letterboxd film slug*)

		Films similar to a given film on letterboxd.

		[Example](https://letterboxd.com/film/legend/similar/)
		```json
		{
			"plugin": "letterboxd",
			"hub": "similar",
			"arg": "legend"
		}
		```
	
	- **list**: (*list href*)

		Get Films from a film list on letterboxd.

		[Example](https://letterboxd.com/oscars/list/oscar-winning-films-best-picture/)
		```json
		{
			"plugin": "letterboxd",
			"hub": "list",
			"arg": "/oscars/list/oscar-winning-films-best-picture/by/added/"
		}
		```
