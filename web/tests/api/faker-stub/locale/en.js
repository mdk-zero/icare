/**
 * Stands in for @faker-js/faker under Newman (see "overrides" in web/package.json).
 *
 * postman-collection pins faker 5.5.3, which has a high-severity advisory
 * (GHSA-qxc2-j82w-r537) and no fix upstream, and it reads the old API as it
 * loads, so a newer faker crashes Newman. Faker only powers Postman's
 * {{$random*}} variables. The collection in this folder doesn't use them; it
 * uses {{$timestamp}}, which doesn't need faker.
 */
const generator = () => {
  throw new Error('Postman {{$random*}} variables are off: see web/tests/api/faker-stub/locale/en.js');
};

// Any property is another stand-in, so postman-collection can read faker.address.city as it loads.
const standIn = new Proxy(generator, { get: () => standIn });

module.exports = standIn;
