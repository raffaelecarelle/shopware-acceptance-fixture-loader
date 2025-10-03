VERSION ?= patch

bump:
	npm version $(if $(filter-out bump,$(MAKECMDGOALS)),$(filter-out bump,$(MAKECMDGOALS)),$(VERSION))
	git push --tags
	npm publish

# Questa regola serve per evitare errori quando si passa un parametro
%:
	@: