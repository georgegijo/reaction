import _ from "lodash";
import { Reaction } from "/client/api";
import { Packages } from "/lib/collections";
import { Template } from "meteor/templating";

/**
 *
 * reactionApps
 *   provides="<where matching registry provides is this >"
 *   enabled=true <false for disabled packages>
 *   context= true filter templates to current route
 *   returns matching package registry objects
 *   @example {{#each reactionApps provides="settings" name=packageName container=container}}
 *   @example {{#each reactionApps provides="userAccountDropdown" enabled=true}}
 *   @example
 *     {{#each reactionApps provides="social" name="reaction-social"}}
 *         {{> Template.dynamic template=template data=customSocialSettings }}
 *     {{/each}}
 *
 *   @typedef optionHash
 *   @type {object}
 *   @property {string} name - name of a package.
 *   @property {string} provides -purpose of this package as identified to the registry
 *   @property {string} container - filter registry entries for matching container.
 *   @property {string} shopId - filter to only display results matching shopId, not returned
 *   @property {string} template - filter registry entries for matching template
 *   @type {optionHash}
 *
 *  @return {optionHash} returns an array of filtered, structure reactionApps
 *  [{
 *  	enabled: true
 *   label: "Stripe"
 *   name: "reaction-stripe"
 *   packageId: "QqkGsQCDRhg2LSn8J"
 *   priority: 1
 *   provides: "paymentMethod"
 *   template: "stripePaymentForm"
 *   etc: "additional properties as defined in Packages.registry"
 *   ...
 *  }]
 */

export function Apps(optionHash) {
  const filter = {};
  const registryFilter = {};
  let key;
  const reactionApps = [];
  let options = {};

  // remove audience permissions for owner
  if (Reaction.hasOwnerAccess() && optionHash.audience) {
    delete optionHash.audience;
  }

  // allow for object or option.hash
  if (optionHash) {
    if (optionHash.hash) {
      options = optionHash.hash;
    } else {
      options = optionHash;
    }
  }

  // you could provide a shopId in optionHash
  if (!options.shopId) {
    options.shopId = Reaction.getShopId();
  }

  //
  // build filter to only get matching registry elements
  //
  for (key in options) {
    if ({}.hasOwnProperty.call(options, key)) {
      const value = options[key];
      if (value) {
        if (!(key === "enabled" || key === "name" || key === "shopId")) {
          filter["registry." + key] = Array.isArray(options[key]) ? { $in: value } : value;
          registryFilter[key] = value;
        } else {
          // perhaps not the best way to check but lets admin see all packages
          if (!Reaction.hasOwnerAccess()) {
            if (key !== "shopId") {
              registryFilter[key] = value;
            }
          }
          filter[key] = value;
        }
      }
    }
  }

  // TODO: Fix filter for Packages.find(filter)
  // current filter setup uses "audience" field which is not in registry array items in most (if not all) docs in Packages coll
  Packages.find({}).forEach((app) => {
    const matchingRegistry = _.filter(app.registry, function (item) {
      const itemFilter = _.cloneDeep(registryFilter);

      // check audience permissions only if they exist as part of optionHash and are part of the registry item
      // ideally all routes should use it, safe for backwards compatibility though
      // owner bypasses permissions
      if (!Reaction.hasOwnerAccess() && item.permissions && registryFilter.audience) {
        let hasAccess;

        for (const permission of registryFilter.audience) {
          const hasPermissionToRegistryItem = item.permissions.indexOf(permission) > -1;
          const hasRoleAccessForShop = Roles.userIsInRole(Meteor.userId(), permission, Reaction.getShopId());
          // both checks must pass for access to be granted
          if (hasPermissionToRegistryItem && hasRoleAccessForShop) {
            hasAccess = true;
          }
        }

        if (!hasAccess) {
          return false;
        }

        // safe to clean up now, and isMatch can ignore audience
        delete itemFilter.audience;
      }

      return _.isMatch(item, itemFilter);
    });

    for (const registry of matchingRegistry) {
      reactionApps.push(registry);
    }
  });

  // Sort apps by priority (registry.priority)
  const sortedApps = reactionApps.sort((a, b) => a.priority - b.priority).slice();

  return sortedApps;
}

// Register global template helper
Template.registerHelper("reactionApps", (optionHash) => {
  return Reaction.Apps(optionHash);
});
