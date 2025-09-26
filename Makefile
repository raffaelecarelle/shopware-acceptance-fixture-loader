bump:
	npm version patch
	git add *
	git commit -m "bump version"
	git push
	npm publish