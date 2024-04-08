const isAuth = (req, res, next) => {
  // console.log('auth: ',req.session);
    if (req.session.isAuth) {
      next();
    } else {
      return res.status(401).json({
        sessionExpired: true
      });
    }
  };
  
module.exports = { isAuth };